import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
    participantIds: string[];
    isGroup: boolean;
    name?: string;
    lastMessage?: mongoose.Types.ObjectId;
    lastMessageAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
    {
        participantIds: {
            type: [String],
            required: true,
            validate: [
                {
                    validator: (ids: string[]) => ids.length > 0,
                    message: "participantIds must contain at least one participant"
                },
                {
                    validator: (ids: string[]) => new Set(ids).size === ids.length,
                    message: "participantIds must be unique"
                }
            ]
        },
        isGroup: { type: Boolean, default: false },
        name: { type: String, default: null },
        lastMessage: { type: Schema.Types.ObjectId, ref: "Message", default: null },
        lastMessageAt: { type: Date, default: Date.now }
    },
    {
        timestamps: true
    }
);

export default mongoose.model<IChat>("Chat", ChatSchema);