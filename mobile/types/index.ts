export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  /** SPKI PEM public key — present in user-search and chat-participant responses. */
  publicKey: string | null;
}

export interface MessageSender {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  /** SPKI PEM public key — used to verify RSA message signatures. */
  publicKey: string | null;
}

/**
 * A single chat message as returned by the server.
 *
 * During the plaintext transition (before Phase 6), `text` is populated.
 * After Phase 6 wires up client-side encryption, `text` will be undefined
 * and the encrypted payload fields will be set instead. The UI decrypts
 * client-side before rendering — it never displays raw cipherText.
 */
export interface Message {
  _id: string;
  chat: string;
  senderId: string;

  // ── Encrypted payload (Phase 6+) ────────────────────────────────────────
  cipherText?: string;
  iv?: string;
  encryptedKeys?: Record<string, string>; // userId → base64 RSA-wrapped AES key
  signature?: string;

  // ── Legacy plaintext (transition only) ──────────────────────────────────
  text?: string;

  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The lastMessage summary stored on a Chat.
 * `text` will be undefined for encrypted messages — the UI shows a
 * placeholder ("New message") until the client decrypts it in Phase 6.
 */
export interface ChatLastMessage {
  _id: string;
  text?: string;
  sender: string;
  createdAt: string;
}

export interface Chat {
  _id: string;
  participant: MessageSender;
  lastMessage: ChatLastMessage | null;
  lastMessageAt: string;
  createdAt: string;
}
