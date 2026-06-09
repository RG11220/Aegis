import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { Chat, Message, MessageSender } from "@/types";
import * as Sentry from "@sentry/react-native";
import { SOCKET_URL } from "./config";
import type { Recipient } from "./crypto/message/EncryptMessage";
import { encryptMessage } from "./crypto/message/EncryptMessage";
import { useCryptoSession } from "./cryptoSession";

export interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  onlineUsers: Set<string>;
  typingUsers: Map<string, string>; // chatId → userId
  unreadChats: Set<string>;
  currentChatId: string | null;
  queryClient: QueryClient | null;

  connect: (getToken: () => Promise<string | null>, queryClient: QueryClient) => void;
  disconnect: () => void;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (
    chatId: string,
    plaintext: string,
    currentUser: MessageSender,
    recipients: Recipient[]
  ) => Promise<void>;
  sendTyping: (chatId: string, isTyping: boolean) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  isConnecting: false,
  onlineUsers: new Set(),
  typingUsers: new Map(),
  unreadChats: new Set(),
  currentChatId: null,
  queryClient: null,

  connect: (getToken, queryClient) => {
    const existingSocket = get().socket;
    if (existingSocket?.connected || get().isConnecting) return;

    if (existingSocket) existingSocket.disconnect();
    set({ isConnecting: true });

    // fresh token on every reconnect attempt
    const socket = io(SOCKET_URL, {
      auth: async (cb: (data: { token: string | null }) => void) => {
        const token = await getToken();
        cb({ token });
      },
    });

    socket.on("connect", () => {
      console.log("Socket connected, id:", socket.id);
      Sentry.logger.info("Socket connected", { socketId: socket.id });
      set({ isConnected: true, isConnecting: false });
    });

    socket.on("connect_error", (error: Error) => {
      console.error("Socket connect error", error);
      set({ isConnecting: false });
    });

    socket.on("error", (error: Error) => {
      console.error("Socket error", error);
      set({ isConnecting: false });
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnect", socket.id);
      Sentry.logger.info("Socket disconnect", { socketId: socket.id });
      set({ isConnected: false, isConnecting: false });
    });

    socket.on("online-users", ({ userIds }: { userIds: string[] }) => {
      console.log("Received online-users:", userIds);
      set({ onlineUsers: new Set(userIds) });
    });

    socket.on("user-online", ({ userId }: { userId: string }) => {
      set((state) => ({
        onlineUsers: new Set([...state.onlineUsers, userId]),
      }));
    });

    socket.on("user-offline", ({ userId }: { userId: string }) => {
      set((state) => {
        const onlineUsers = new Set(state.onlineUsers);
        onlineUsers.delete(userId);
        return { onlineUsers: onlineUsers };
      });
    });

    socket.on("socket-error", (error: { message: string }) => {
      console.error("Socket error:", error.message);
      Sentry.logger.error("Socket error occurred", {
        message: error.message,
      });
    });

    // ack: swap optimistic entry with real id
    socket.on(
      "message-ack",
      ({ tempId, messageId, chatId }: { tempId: string; messageId: string; chatId: string }) => {
        queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
          old?.map((m) => (m._id === tempId ? { ...m, _id: messageId } : m)) ?? []
        );
      }
    );

    socket.on("new-message", (message: Message & { originalTempId?: string }) => {
      const senderId = message.senderId;
      const { currentChatId } = get();

      // replace optimistic entry, filter both tempId and real id
      queryClient.setQueryData<Message[]>(["messages", message.chat], (old) => {
        if (!old) return [message];
        const filtered = old.filter(
          (m) => m._id !== message.originalTempId && m._id !== message._id
        );
        return [...filtered, message];
      });

      // update lastMessage; no plaintext, shows placeholder
      queryClient.setQueryData<Chat[]>(["chats"], (oldChats) => {
        return oldChats?.map((chat) => {
          if (chat._id === message.chat) {
            return {
              ...chat,
              lastMessage: {
                _id: message._id,
                // text undefined for encrypted msgs
                sender: senderId,
                createdAt: message.createdAt,
              },
              lastMessageAt: message.createdAt,
            };
          }
          return chat;
        });
      });

      // mark unread if not in this chat
      if (currentChatId !== message.chat) {
        const chats = queryClient.getQueryData<Chat[]>(["chats"]);
        const chat = chats?.find((c) => c._id === message.chat);
        // DM: only mark unread if the other participant sent it
        // Group: mark unread for any incoming message (we don't have currentUserId here,
        //        but the sender will always be in the chat room when they send, so
        //        currentChatId === message.chat will be true for our own messages)
        const shouldMarkUnread = chat?.isGroup
          ? true
          : senderId === chat?.participant?._id;
        if (shouldMarkUnread) {
          set((state) => ({
            unreadChats: new Set([...state.unreadChats, message.chat]),
          }));
        }
      }

      // clear typing on receive
      set((state) => {
        const typingUsers = new Map(state.typingUsers);
        typingUsers.delete(message.chat);
        return { typingUsers: typingUsers };
      });
    });

    socket.on(
      "typing",
      ({ userId, chatId, isTyping }: { userId: string; chatId: string; isTyping: boolean }) => {
        set((state) => {
          const typingUsers = new Map(state.typingUsers);
          if (isTyping) typingUsers.set(chatId, userId);
          else typingUsers.delete(chatId);

          return { typingUsers: typingUsers };
        });
      }
    );

    set({ socket, queryClient });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        onlineUsers: new Set(),
        typingUsers: new Map(),
        unreadChats: new Set(),
        currentChatId: null,
        queryClient: null,
      });
    }
  },
  joinChat: (chatId) => {
    const socket = get().socket;
    set((state) => {
      const unreadChats = new Set(state.unreadChats);
      unreadChats.delete(chatId);
      return { currentChatId: chatId, unreadChats: unreadChats };
    });

    if (socket?.connected) {
      socket.emit("join-chat", chatId);
    }
  },
  leaveChat: (chatId) => {
    const { socket } = get();
    set({ currentChatId: null });
    if (socket?.connected) {
      socket.emit("leave-chat", chatId);
    }
  },
  sendMessage: async (chatId, plaintext, currentUser, recipients) => {
    const { socket, queryClient } = get();
    if (!socket?.connected || !queryClient) {
      throw new Error("Socket not connected or query client unavailable");
    }

    const tempId = `temp-${Date.now()}`;

    // optimistic — replaced when server acks
    const optimisticMessage: Message = {
      _id: tempId,
      chat: chatId,
      senderId: currentUser._id,
      text: plaintext, // local display only
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData<Message[]>(["messages", chatId], (old) => {
      if (!old) return [optimisticMessage];
      return [...old, optimisticMessage];
    });

    const { privateKeyPem } = useCryptoSession.getState();
    if (!privateKeyPem) {
      Sentry.logger.error("Cannot send: crypto session not initialised", { chatId });
      Alert.alert("Message failed to send", "Encryption unavailable. Please try again after unlocking your keys.");
      queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
        old?.filter((m) => m._id !== tempId) ?? []
      );
      throw new Error("Crypto session not initialised");
    }

    let encryptedPayload: ReturnType<typeof encryptMessage>;
    try {
      encryptedPayload = encryptMessage(plaintext, currentUser._id, chatId, privateKeyPem, recipients);
    } catch (err) {
      Sentry.logger.error("Encryption failed", { chatId, error: String(err) });
      Alert.alert("Message failed to send", "Message encryption failed. Please try again.");
      queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
        old?.filter((m) => m._id !== tempId) ?? []
      );
      throw err;
    }

    const payload = { chatId, ...encryptedPayload, tempId };

    await new Promise<void>((resolve, reject) => {
      socket.emit("send-message", payload, (response: { error?: string; messageId?: string }) => {
        if (response?.error) {
          Sentry.logger.error("Failed to send message", {
            chatId,
            error: response.error,
            tempId,
          });
          Alert.alert("Message failed to send", response.error ?? "An unknown error occurred.");
          queryClient.setQueryData<Message[]>(["messages", chatId], (old) => {
            if (!old) return [];
            return old.filter((m) => m._id !== (response.messageId ?? tempId));
          });
          reject(new Error(response.error ?? "Message send failed"));
          return;
        }

        Sentry.logger.info("Message sent successfully", {
          chatId,
          messageLength: plaintext.length,
          tempId,
        });
        resolve();
      });
    });
  },

  sendTyping: (chatId, isTyping) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit("typing", { chatId, isTyping });
    }
  },
}));

export default useSocketStore;