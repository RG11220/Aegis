import type { Response, NextFunction } from "express"; // also fix 'response' -> 'Response'
import type { AuthRequest } from "../middleware/auth";
import Message from "../models/Message";
import Chat from "../models/Chat";

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {

try{
    const userId = req.userId;  
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
        return res.status(404).json({ error: "Chat not found or access denied" });
    }
   const messages = await Message.find({ chat: chatId }).populate("sender", "name email avatar").sort({ createdAt: 1 });


} catch (error) {
    res.status(500);
    next(error);
}
}