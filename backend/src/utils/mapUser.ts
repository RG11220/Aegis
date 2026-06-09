import type { RowDataPacket } from "mysql2/promise";

export interface UserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
  publicKey?: string | null;
}

export interface AppUser {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  publicKey: string | null;
}

export const mapUser = (row: UserRow): AppUser => ({
  _id: String(row.userID),
  name: row.userName,
  email: row.userEmail,
  avatar: row.profilePicture,
  publicKey: row.publicKey ?? null,
});
