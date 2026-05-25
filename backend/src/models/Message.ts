/**
 * Mongo Message model — E2E-encrypted message package.
 *
 * Encryption layout (AES-256-CTR + RSA-OAEP + RSA signature):
 *   cipherText    — hex-encoded AES-256-CTR ciphertext of the plaintext
 *   iv            — hex-encoded 16-byte counter-mode IV (random per message)
 *   encryptedKeys — map of userId → RSA-OAEP(recipient pubKey, AES key)
 *                   includes both sender and recipient so sender can re-read
 *   signature     — RSA signature (PKCS#1 v1.5 / PSS) over
 *                   `${senderId}:${chatId}:${iv}:${cipherText}` (Phase 3)
 *
 * The `text` field is retained as optional during the plaintext→ciphertext
 * transition. It will be removed when Phase 6 wires up client-side encryption.
 * The server never reads or logs `cipherText` content — it is a blind relay.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IMessage extends Document {
  chat: mongoose.Types.ObjectId;
  senderId: string;

  // ── Encrypted payload (set by Phase 6+) ──────────────────────────────────
  cipherText?: string;
  iv?: string;
  encryptedKeys?: Map<string, string>; // userId → base64-encoded RSA-wrapped AES key
  signature?: string;

  // ── Legacy plaintext field (transition only — remove after Phase 6) ──────
  text?: string;

  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    senderId: { type: String, required: true },

    // Encrypted payload
    cipherText: { type: String, default: null },
    iv: { type: String, default: null },
    encryptedKeys: { type: Map, of: String, default: null },
    signature: { type: String, default: null },

    // Legacy plaintext (transition only)
    text: { type: String, default: null, trim: true },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ chat: 1, createdAt: 1 });

export default mongoose.model<IMessage>("Message", MessageSchema);
