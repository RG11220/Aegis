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

  const allowedOrigins = [
    "http://localhost:8081",
    "http://localhost:5173",
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  const io = new SocketServer(httpServer, { cors: { origin: allowedOrigins } });

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

    socket.on("send-message", async (data: { chatId: string; text: string }) => {
      try {
        const { chatId, text } = data;

        const chat = await Chat.findOne({
          _id: chatId,
          participantIds: userId,
        });

        if (!chat) {
          socket.emit("socket-error", { message: "Chat not found" });
          return;
        }

        const message = await Message.create({
          chat: chatId,
          senderId: userId,
          text,
        });

        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        await chat.save();

        // Fix 3: Track who's in the chat room to avoid double emission
        const chatRoom = io.sockets.adapter.rooms.get(`chat:${chatId}`);

        for (const participantId of chat.participantIds) {
          const participantSocketIds = onlineUsers.get(participantId);
          if (!participantSocketIds) continue;

          const isInChatRoom = [...participantSocketIds].some((sid) =>
            chatRoom?.has(sid)
          );

          if (isInChatRoom) {
            // They're in the chat room — emit there only
            io.to(`chat:${chatId}`).emit("new-message", message);
          } else {
            // They're online but not in the chat room — emit to personal room
            io.to(`user:${participantId}`).emit("new-message", message);
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