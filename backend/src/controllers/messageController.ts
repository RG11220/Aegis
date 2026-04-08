import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/auth";
import Message from "../models/Message";
import Chat from "../models/Chat";

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { chatId } = req.params;

    // Fix: use participantIds instead of participants
    const chat = await Chat.findOne({ _id: chatId, participantIds: userId });
    if (!chat) {
      res.status(404).json({ error: "Chat not found or access denied" });
      return;
    }

    // No populate needed — senderId is a plain SQL userID string, not a ref
    const messages = await Message.find({ chat: chatId }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500);
    next(error);
  }
}