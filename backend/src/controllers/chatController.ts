import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import Chat from "../models/Chat";
import _pool from "../config/database";
import type { RowDataPacket } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

interface UserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
}

export async function getChats(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    // Find all chats where this user is a participant
    const chats = await Chat.find({ participantIds: userId })
      .populate("lastMessage")
      .sort({ lastMessageAt: -1 });

    // For each chat, fetch the other participant's info from SQL
    const formattedChats = await Promise.all(
      chats.map(async (chat) => {
        const otherUserId = chat.participantIds.find((id) => id !== userId);

        const [rows] = await execute(
          "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userID = ? LIMIT 1",
          [otherUserId]
        ) as [UserRow[], unknown];

        return {
          _id: chat._id,
          participant: rows[0] ?? null,
          lastMessage: chat.lastMessage,
          lastMessageAt: chat.lastMessageAt,
          createdAt: chat.createdAt,
        };
      })
    );

    res.json(formattedChats);
  } catch (error) {
    res.status(500);
    next(error);
  }
}




export async function getOrCreateChat(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { targetUserId } = req.params; // or req.body, depending on your route

    if (!targetUserId) {
      res.status(400).json({ message: "Participant ID is required" });
      return;
    }

    if (targetUserId === userId) {
      res.status(400).json({ message: "Cannot create chat with yourself" });
      return;
    }

    // Find or create chat
    let chat = await Chat.findOne({
    participantIds: { $all: [String(userId), String(targetUserId)], $size: 2 },
    }).populate("lastMessage");

    if (!chat) {
     chat = await Chat.create({
  participantIds: [String(userId), String(targetUserId)],
    });
    }

    // Fetch other participant from SQL
    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userID = ? LIMIT 1",
      [targetUserId]
    ) as [UserRow[], unknown];

    res.json({
      _id: chat._id,
      participant: rows[0] ?? null,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      createdAt: chat.createdAt,
    });
  } catch (error) {
    res.status(500);
    next(error);
  }
}