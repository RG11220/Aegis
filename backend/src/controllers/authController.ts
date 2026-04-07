import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import { clerkClient, getAuth } from "@clerk/express";
import _pool from "../config/database";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

interface ClerkUserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
  clerkId: string;
}

// GET /auth/me — returns the current logged-in user from SQL
export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;

    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userID = ? LIMIT 1",
      [userId]
    ) as [ClerkUserRow[], unknown];

    const user = rows[0];

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500);
    next(error);
  }
}

// POST /auth/callback — called after Clerk login to sync user into SQL DB
export async function authCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkId } = getAuth(req);

    if (!clerkId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Fetch user info from Clerk first
    const clerkUser = await clerkClient.users.getUser(clerkId);

    const name = (clerkUser.firstName
      ? `${clerkUser.firstName} ${clerkUser.lastName || ""}`.trim()
      : clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Unknown"
    ).slice(0, 100);

    const email = (clerkUser.emailAddresses[0]?.emailAddress ?? "").slice(0, 255);
    const avatar = (clerkUser.imageUrl ?? "").slice(0, 500);

    // Atomic upsert — no race condition possible
    // If clerkId already exists (unique constraint), update name/avatar in case they changed
    await execute(
      `INSERT INTO Users (userName, userEmail, profilePicture, clerkId)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         userName = VALUES(userName),
         profilePicture = VALUES(profilePicture)`,
      [name, email, avatar, clerkId]
    ) as [ResultSetHeader, unknown];

    // Fetch the final user record (works for both insert and update)
    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE clerkId = ? LIMIT 1",
      [clerkId]
    ) as [ClerkUserRow[], unknown];

    const user = rows[0];

    if (!user) {
      res.status(500).json({ message: "Failed to retrieve user after upsert" });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500);
    next(error);
  }
}