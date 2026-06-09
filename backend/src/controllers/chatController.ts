import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import Chat from "../models/Chat";
import _pool from "../config/database";
import { mapUser, type UserRow } from "../utils/mapUser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

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
          "SELECT userID, userName, userEmail, profilePicture, publicKey FROM Users WHERE userID = ? LIMIT 1",
          [otherUserId]
        ) as [UserRow[], unknown];

        return {
          _id: chat._id,
          participant: rows[0] ? mapUser(rows[0]) : null,
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
  const { participantId: targetUserId } = req.params;
    if (!targetUserId) {
      res.status(400).json({ message: "Participant ID is required" });
      return;
    }

    if (targetUserId === userId) {
      res.status(400).json({ message: "Cannot create chat with yourself" });
      return;
    }

    if (targetUserId === userId) {
  res.status(400).json({ message: "Cannot create chat with yourself" });
  return;
}

//  ADD THIS
const [userRows] = await execute(
  "SELECT userID FROM Users WHERE userID = ? LIMIT 1",
  [targetUserId]
) as [UserRow[], unknown];

if (!userRows[0]) {
  res.status(404).json({ message: "User not found" });
  return;
}

// then continue to Chat.findOne...

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
      "SELECT userID, userName, userEmail, profilePicture, publicKey FROM Users WHERE userID = ? LIMIT 1",
      [targetUserId]
    ) as [UserRow[], unknown];

    res.json({
      _id: chat._id,
      participant: rows[0] ? mapUser(rows[0]) : null,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      createdAt: chat.createdAt,
    });
  } catch (error) {
    res.status(500);
    next(error);
  }
}