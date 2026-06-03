import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "@clerk/express";
import Message from "../models/Message";
import Chat from "../models/Chat";
import _pool from "../config/database";
import type { RowDataPacket } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

interface UserRow extends RowDataPacket {
  userID: number;
}

// Fix 1: Store a Set of socketIds per userId to support multi-device
export const onlineUsers: Map<string, Set<string>> = new Map();

export const initializeSocket = (httpServer: HttpServer) => {
  // Fix 2: Validate CLERK_SECRET_KEY at startup
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is not set in environment variables");
  }
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;

  const DEV_ORIGINS = [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
    /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  ];

  const originFn = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    // Native mobile clients send no Origin header — always allow
    if (!origin) return cb(null, true);
    const allowed = process.env.NODE_ENV === "production"
      ? origin === process.env.FRONTEND_URL
      : DEV_ORIGINS.some((r) => r.test(origin));
    cb(allowed ? null : new Error(`CORS: ${origin} not allowed`), allowed);
  };

  const io = new SocketServer(httpServer, { cors: { origin: originFn, credentials: true } });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    try {
      const session = await verifyToken(token, { secretKey: clerkSecretKey });
      const clerkId = session.sub;

      const [rows] = await execute(
        "SELECT userID FROM Users WHERE clerkId = ? LIMIT 1",
        [clerkId]
      ) as [UserRow[], unknown];

      if (!rows[0]) return next(new Error("User not found"));

      socket.data.userId = rows[0].userID.toString();
      next();
    } catch (error: unknown) {
      next(new Error(String(error)));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;

    // Fix 1: Add socketId to the user's Set
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Only broadcast online if this is their FIRST connection
    if (onlineUsers.get(userId)!.size === 1) {
      socket.broadcast.emit("user-online", { userId });
    }

    socket.emit("online-users", { userIds: Array.from(onlineUsers.keys()) });

    socket.join(`user:${userId}`);

    socket.on("join-chat", async (chatId: string) => {
    const chat = await Chat.findOne({ _id: chatId, participantIds: userId });
    if (chat) {
      socket.join(`chat:${chatId}`);
      }
    });

    socket.on("leave-chat", (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on("send-message", async (data: {
      chatId: string;
      cipherText: string;
      iv: string;
      encryptedKeys: Record<string, string>;
      signature: string;
      tempId?: string;
    }) => {
      try {
        const { chatId, cipherText, iv, encryptedKeys, signature, tempId } = data;

        // Basic field validation — server is a blind relay; it never reads cipherText
        if (!chatId || !cipherText || !iv || !encryptedKeys || !signature) {
          socket.emit("socket-error", { message: "Missing required encrypted fields" });
          return;
        }

        const chat = await Chat.findOne({
          _id: chatId,
          participantIds: userId,
        });

        if (!chat) {
          socket.emit("socket-error", { message: "Chat not found" });
          return;
        }

        // Verify the sender has a key slot in encryptedKeys (must include themselves)
        if (!encryptedKeys[userId]) {
          socket.emit("socket-error", { message: "Sender key slot missing from encryptedKeys" });
          return;
        }

        const message = await Message.create({
          chat: chatId,
          senderId: userId,
          cipherText,
          iv,
          encryptedKeys: new Map(Object.entries(encryptedKeys)),
          signature,
          // text is intentionally omitted — server never stores plaintext
        });

        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        await chat.save();

        // Serialise Map → plain object for JSON emission
        const messagePayload = {
          _id: message._id,
          chat: message.chat,
          senderId: message.senderId,
          cipherText: message.cipherText,
          iv: message.iv,
          encryptedKeys: Object.fromEntries(message.encryptedKeys ?? new Map()),
          signature: message.signature,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          originalTempId: tempId,
        };

        // ACK the sender with the real message ID and chatId so cached messages
        // can be updated without relying on a stale currentChatId.
        socket.emit("message-ack", { tempId, messageId: message._id, chatId });

        const chatRoom = io.sockets.adapter.rooms.get(`chat:${chatId}`);

        for (const participantId of chat.participantIds) {
          const participantSocketIds = onlineUsers.get(participantId);
          if (!participantSocketIds) continue;

          const isInChatRoom = [...participantSocketIds].some((sid) =>
            chatRoom?.has(sid)
          );

          if (isInChatRoom) {
            io.to(`chat:${chatId}`).emit("new-message", messagePayload);
          } else {
            io.to(`user:${participantId}`).emit("new-message", messagePayload);
          }
        }
      } catch {
        socket.emit("socket-error", { message: "Failed to send message" });
      }
    });

    socket.on("typing", async (data: { chatId: string; isTyping: boolean }) => {
      const typingPayload = { userId, chatId: data.chatId, isTyping: data.isTyping };

      socket.to(`chat:${data.chatId}`).emit("typing", typingPayload);

      try {
        const chat = await Chat.findById(data.chatId);
        if (chat) {
          const otherParticipantId = chat.participantIds.find((p) => p !== userId);
          if (otherParticipantId) {
            socket.to(`user:${otherParticipantId}`).emit("typing", typingPayload);
          }
        }
      } catch {
        // silently fail
      }
    });

    socket.on("disconnect", () => {
      // Fix 1: Remove only this socketId from the Set
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);

        // Only broadcast offline if they have NO remaining connections
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          socket.broadcast.emit("user-offline", { userId });
        }
      }
    });
  });

  return io;
};