import type { RowDataPacket } from "mysql2/promise";

export interface UserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
}

export interface AppUser {
  _id: string;
  name: string;
  email: string;
  avatar: string;
}

/**
 * Maps a raw SQL `Users` row to the shape the mobile app expects
 * (`_id`, `name`, `email`, `avatar`). The mobile client is written against
 * a Mongo-style schema, so SQL column names must be normalized here.
 */
export const mapUser = (row: UserRow): AppUser => ({
  _id: String(row.userID),
  name: row.userName,
  email: row.userEmail,
  avatar: row.profilePicture,
});
