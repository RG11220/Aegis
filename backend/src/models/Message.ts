import mongoose, { Schema, type Document } from "mongoose";

export interface IMessage extends Document {
    chat: mongoose.Types.ObjectId; 
    senderId: string; 
    text: string;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    senderId: { type: String, required: true }, 
    text: { type: String, required: true, trim: true }
}, { timestamps: true });

MessageSchema.index({ chat: 1, createdAt:1 });

export default mongoose.model<IMessage>("Message", MessageSchema);