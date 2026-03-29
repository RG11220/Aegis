import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
    participantIds: string[]; // Changed from ObjectId[] to string[]
    lastMessage?: mongoose.Types.ObjectId;
    lastMessageAt?: Date; 
    createdAt: Date;
    updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
    { 
        participantIds: [{ type: String, required: true }], 
        lastMessage: { type: Schema.Types.ObjectId, ref: "Message", default: null },
        lastMessageAt: { type: Date, default: Date.now }
    }, 
    { 
        timestamps: true 
    }
);

export default mongoose.model<IChat>("Chat", ChatSchema);