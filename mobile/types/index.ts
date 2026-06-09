export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  publicKey: string | null;
}

export interface MessageSender {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  publicKey: string | null;
}

export interface Message {
  _id: string;
  chat: string;
  senderId: string;

  // encrypted payload
  cipherText?: string;
  iv?: string;
  encryptedKeys?: Record<string, string>; // userId → base64 RSA-wrapped AES key
  signature?: string;

  // legacy plaintext (transition only)
  text?: string;

  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

// text undefined for encrypted msgs; UI shows placeholder
export interface ChatLastMessage {
  _id: string;
  text?: string;
  sender: string;
  createdAt: string;
}

export interface Chat {
  _id: string;
  isGroup: boolean;
  // DM only
  participant?: MessageSender;
  // Group only
  name?: string;
  participants?: MessageSender[];
  lastMessage: ChatLastMessage | null;
  lastMessageAt: string;
  createdAt: string;
}
