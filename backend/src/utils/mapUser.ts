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
  /** SPKI PEM public key — included when the SELECT fetches the publicKey column. */
  publicKey: string | null;
}

/**
 * Maps a raw SQL `Users` row to the shape the mobile app expects.
 * `publicKey` is included when the query selects it (user search, chat participants).
 */
export const mapUser = (row: UserRow): AppUser => ({
  _id: String(row.userID),
  name: row.userName,
  email: row.userEmail,
  avatar: row.profilePicture,
  publicKey: row.publicKey ?? null,
});
