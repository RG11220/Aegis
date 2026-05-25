/**
 * MySQL query helpers for the Users table.
 * All crypto columns (publicKey, privateKey, keySalt) store hex/PEM strings;
 * decryption always happens on the client — the server is a blind relay.
 *
 * Note: the DB column is `UserEmail` (capital U+E). MySQL is case-insensitive
 * for identifiers in queries, but mysql2 returns keys with the exact DB casing,
 * so the UserRow interface mirrors that exactly.
 */

import _pool from "../config/database";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

export interface UserRow extends RowDataPacket {
  userID: number;
  userName: string;
  UserEmail: string;
  userPassword: string | null;
  publicKey: string | null;
  privateKey: string | null;
  keySalt: string | null;
  isVerified: number; // tinyint → 0 or 1
  profilePicture: string | null;
  createdAt: Date;
  clerkId: string | null;
}

export const createEncryptedUser = async (
  userName: string,
  userEmail: string,
  hashedPassword: string,
  publicKey: string,
  encryptedPrivateKey: string,
  keySalt: string,
  profilePicture?: string
): Promise<number> => {
  const sql = `
    INSERT INTO Users
    (userName, UserEmail, userPassword, publicKey, privateKey, keySalt, profilePicture, isVerified)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `;
  const [result] = await execute(sql, [
    userName,
    userEmail,
    hashedPassword,
    publicKey,
    encryptedPrivateKey,
    keySalt,
    profilePicture ?? null,
  ]) as [ResultSetHeader, unknown];
  return result.insertId;
};

export const getUserByEmail = async (userEmail: string): Promise<UserRow | null> => {
  const sql = "SELECT * FROM Users WHERE UserEmail = ? LIMIT 1";
  const [rows] = await execute(sql, [userEmail]) as [UserRow[], unknown];
  return rows[0] ?? null;
};

export const getUserById = async (userID: number): Promise<UserRow | null> => {
  const sql = "SELECT * FROM Users WHERE userID = ? LIMIT 1";
  const [rows] = await execute(sql, [userID]) as [UserRow[], unknown];
  return rows[0] ?? null;
};

export const setUserVerified = async (userID: number): Promise<void> => {
  await execute("UPDATE Users SET isVerified = 1 WHERE userID = ?", [userID]);
};

/**
 * Store the user's RSA public key and encrypted private key blob.
 * Called once after account creation — server never sees the plaintext private key.
 */
export const storeUserKeys = async (
  userID: number,
  publicKey: string,
  encryptedPrivateKey: string,
  keySalt: string
): Promise<void> => {
  await execute(
    "UPDATE Users SET publicKey = ?, privateKey = ?, keySalt = ? WHERE userID = ?",
    [publicKey, encryptedPrivateKey, keySalt, userID]
  );
};

/**
 * Provision a user's full crypto set in one update: hashed password, public key,
 * encrypted private key, key salt, and mark the account verified (email was already
 * confirmed via the auth provider before this runs).
 */
export const provisionUserCrypto = async (
  userID: number,
  hashedPassword: string,
  publicKey: string,
  encryptedPrivateKey: string,
  keySalt: string
): Promise<void> => {
  await execute(
    `UPDATE Users
     SET userPassword = ?, publicKey = ?, privateKey = ?, keySalt = ?, isVerified = 1
     WHERE userID = ?`,
    [hashedPassword, publicKey, encryptedPrivateKey, keySalt, userID]
  );
};

export const updateEncryptedPrivateKey = async (
  userID: number,
  encryptedPrivateKey: string,
  keySalt: string,
  hashedPassword: string
): Promise<void> => {
  const sql = `
    UPDATE Users
    SET privateKey = ?, keySalt = ?, userPassword = ?
    WHERE userID = ?
  `;
  await execute(sql, [encryptedPrivateKey, keySalt, hashedPassword, userID]);
};
