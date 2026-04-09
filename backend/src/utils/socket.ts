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

// store online users in memory: userId -> socketId
export const onlineUsers: Map<string, string> = new Map();

export const initializeSocket = (httpServer: HttpServer) => {
  const allowedOrigins = [
    "http://localhost:8081", // Expo mobile
    "http://localhost:5173", // Vite web dev
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  const io = new SocketServer(httpServer, { cors: { origin: allowedOrigins } });

  // Authenticate socket connection via Clerk token
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    try {
      const session = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });

      const clerkId = session.sub;

      // Look up user in SQL by clerkId
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

    // Send list of online users to newly connected client
    socket.emit("online-users", { userIds: Array.from(onlineUsers.keys()) });

    // Store user in onlineUsers map
    onlineUsers.set(userId, socket.id);

    // Notify others this user is online
    socket.broadcast.emit("user-online", { userId });

    socket.join(`user:${userId}`);

    socket.on("join-chat", (chatId: string) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on("leave-chat", (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    // Handle sending messages
    socket.on("send-message", async (data: { chatId: string; text: string }) => {
      try {
        const { chatId, text } = data;

        // Use participantIds (your field name)
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
          senderId: userId, // your field name
          text,
        });

        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        await chat.save();

        // Emit to chat room
        io.to(`chat:${chatId}`).emit("new-message", message);

        // Emit to each participant's personal room
        for (const participantId of chat.participantIds) {
          io.to(`user:${participantId}`).emit("new-message", message);
        }
      } catch (error) {
        socket.emit("socket-error", { message: "Failed to send message" });
      }
    });

    socket.on("typing", async (data: { chatId: string; isTyping: boolean }) => {
      const typingPayload = {
        userId,
        chatId: data.chatId,
        isTyping: data.isTyping,
      };

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
        // silently fail - typing indicator is not critical
      }
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit("user-offline", { userId });
    });
  });

  return io;
};