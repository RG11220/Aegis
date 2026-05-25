import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import { clerkClient, getAuth } from "@clerk/express";
import _pool from "../config/database";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { mapUser } from "../utils/mapUser";
import { getUserById, storeUserKeys } from "../queries/userQueries";

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

    res.status(200).json(mapUser(user));
  } catch (error) {
    res.status(500);
    next(error);
  }
}

// GET /auth/crypto-keys — returns publicKey, encryptedPrivateKey, keySalt for the auth'd user
// The server never decrypts anything — it only stores and returns these blobs.
export async function getCryptoKeys(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userID = parseInt(req.userId ?? "", 10);
    if (isNaN(userID)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await getUserById(userID);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.publicKey || !user.privateKey || !user.keySalt) {
      res.status(404).json({ message: "Crypto keys not initialised for this account" });
      return;
    }

    res.status(200).json({
      publicKey:          user.publicKey,
      encryptedPrivateKey: user.privateKey,
      keySalt:            user.keySalt,
    });
  } catch (error) {
    res.status(500);
    next(error);
  }
}

// POST /auth/register-keys — stores the client-generated RSA public key and
// encrypted private key blob. Called once right after account creation.
// The server never sees the plaintext private key.
export async function registerKeys(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userID = parseInt(req.userId ?? "", 10);
    if (isNaN(userID)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { publicKey, encryptedPrivateKey, keySalt } = req.body as {
      publicKey?: string;
      encryptedPrivateKey?: string;
      keySalt?: string;
    };

    if (!publicKey || !encryptedPrivateKey || !keySalt) {
      res.status(400).json({ message: "publicKey, encryptedPrivateKey, and keySalt are required" });
      return;
    }

    await storeUserKeys(userID, publicKey, encryptedPrivateKey, keySalt);
    res.status(200).json({ ok: true });
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

    res.status(200).json(mapUser(user));
  } catch (error) {
    res.status(500);
    next(error);
  }
}