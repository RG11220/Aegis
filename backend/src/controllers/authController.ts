import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import { clerkClient, getAuth } from "@clerk/express";
import _pool from "../config/database";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { mapUser } from "../utils/mapUser";
import { getUserById, storeUserKeys, provisionUserCrypto } from "../queries/userQueries";
import { sendSeedPhraseEmail } from "../utils/email";
import { generateRSAKeyPairFromSeed, generateSeedPhrase } from "../crypto/rsa/RsaFromSeed";
import { encryptPrivateKey } from "../crypto/password/Encryptprivatekey";
import { hashPassword } from "../crypto/password/Hashpassword";
import { WORD_SET } from "../crypto/seed/SeedDictionary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

interface ClerkUserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
  clerkId: string;
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;

    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture, publicKey FROM Users WHERE userID = ? LIMIT 1",
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

// return key blobs; server never decrypts
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

// store client-generated keys; server never sees plaintext private key
export async function registerKeys(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userID = parseInt(req.userId ?? "", 10);
    if (isNaN(userID)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { publicKey, encryptedPrivateKey, keySalt, seedPhrase } = req.body as {
      publicKey?: string;
      encryptedPrivateKey?: string;
      keySalt?: string;
      seedPhrase?: string[];
    };

    if (!publicKey || !encryptedPrivateKey || !keySalt) {
      res.status(400).json({ message: "publicKey, encryptedPrivateKey, and keySalt are required" });
      return;
    }

    if (seedPhrase !== undefined) {
      if (!Array.isArray(seedPhrase) || seedPhrase.length !== 24) {
        res.status(400).json({ message: "seedPhrase must be an array of exactly 24 words" });
        return;
      }
      for (const word of seedPhrase) {
        const w = typeof word === "string" ? word.toLowerCase().trim() : "";
        if (!WORD_SET.has(w)) {
          res.status(400).json({ message: `Unknown word in seed phrase: "${word}"` });
          return;
        }
      }
    }

    const existingUser = await getUserById(userID);
    if (!existingUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (existingUser.publicKey || existingUser.privateKey || existingUser.keySalt) {
      res.status(409).json({ message: "Crypto keys already registered for this account" });
      return;
    }

    await storeUserKeys(userID, publicKey, encryptedPrivateKey, keySalt);

    // email seed phrase, non-fatal
    if (seedPhrase) {
      try {
        await sendSeedPhraseEmail(existingUser.UserEmail, existingUser.userName, seedPhrase);
      } catch (emailErr) {
        console.error("[registerKeys] Seed phrase email failed (keys stored OK):", emailErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500);
    next(error);
  }
}

// keygen server-side (too slow on device); brief escrow
export async function provisionKeys(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userID = parseInt(req.userId ?? "", 10);
    if (isNaN(userID)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { password } = req.body as { password?: string };
    if (!password || typeof password !== "string") {
      res.status(400).json({ message: "password is required" });
      return;
    }

    if (password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      res.status(400).json({
        message:
          "Password must be at least 8 characters long and include both letters and numbers.",
      });
      return;
    }

    const user = await getUserById(userID);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (user.publicKey || user.privateKey || user.keySalt) {
      res.status(409).json({ message: "Crypto keys already provisioned for this account" });
      return;
    }

    const seedPhrase = generateSeedPhrase();
    const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(seedPhrase);
    const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);
    const hashedPassword = await hashPassword(password);

    await provisionUserCrypto(userID, hashedPassword, publicKeyPem, encryptedPrivateKey, keySalt);

    // email recovery words, non-fatal
    try {
      await sendSeedPhraseEmail(user.UserEmail, user.userName, seedPhrase);
    } catch (emailErr) {
      console.error("[provisionKeys] Seed phrase email failed (keys stored OK):", emailErr);
    }

    res.status(200).json({ publicKey: publicKeyPem, privateKey: privateKeyPem, seedPhrase });
  } catch (error) {
    res.status(500);
    next(error);
  }
}

export async function authCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkId } = getAuth(req);

    if (!clerkId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Always pull the latest from Clerk so username / profile-picture changes propagate
    // to the Users table — that's what everyone else reads (not Clerk directly).
    const clerkUser = await clerkClient.users.getUser(clerkId);

    const name = (clerkUser.username
      ? clerkUser.username
      : clerkUser.firstName
      ? `${clerkUser.firstName} ${clerkUser.lastName || ""}`.trim()
      : clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Unknown"
    ).slice(0, 100);

    const email = (clerkUser.emailAddresses[0]?.emailAddress ?? "").slice(0, 255);
    const avatar = (clerkUser.imageUrl ?? "").slice(0, 500);

    // upsert; corrects stale clerkIds too
    await execute(
      `INSERT INTO Users (userName, userEmail, profilePicture, clerkId)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         clerkId        = VALUES(clerkId),
         userName       = VALUES(userName),
         profilePicture = VALUES(profilePicture)`,
      [name, email, avatar, clerkId]
    ) as [ResultSetHeader, unknown];

    let [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE clerkId = ? LIMIT 1",
      [clerkId]
    ) as [ClerkUserRow[], unknown];

    if (!rows[0] && email) {
      // clerkId not updated yet, patch via email
      const [emailRows] = await execute(
        "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userEmail = ? LIMIT 1",
        [email]
      ) as [ClerkUserRow[], unknown];

      if (emailRows[0]) {
        await execute("UPDATE Users SET clerkId = ? WHERE userEmail = ?", [clerkId, email]);
        rows = emailRows;
      }
    }

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

export async function recoverKeys(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userID = parseInt(req.userId ?? "", 10);
    if (isNaN(userID)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { words, newEncryptedPrivateKey, newKeySalt } = req.body as {
      words?: string[];
      newEncryptedPrivateKey?: string;
      newKeySalt?: string;
    };

    if (!Array.isArray(words) || words.length !== 24) {
      res.status(400).json({ message: "words must be an array of exactly 24 words" });
      return;
    }
    if (!newEncryptedPrivateKey || !newKeySalt) {
      res.status(400).json({ message: "newEncryptedPrivateKey and newKeySalt are required" });
      return;
    }

    const user = await getUserById(userID);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (!user.publicKey) {
      res.status(404).json({ message: "No crypto keys found for this account" });
      return;
    }

    let derivedPublicKey: string;
    try {
      const { publicKeyPem } = await generateRSAKeyPairFromSeed(words);
      derivedPublicKey = publicKeyPem;
    } catch (err: any) {
      res.status(400).json({ message: `Invalid seed phrase: ${err.message}` });
      return;
    }

    // PEMs may differ in whitespace
    const normalise = (pem: string) => pem.replace(/\s+/g, "");
    if (normalise(derivedPublicKey) !== normalise(user.publicKey)) {
      res.status(403).json({ message: "Seed phrase does not match the keys for this account" });
      return;
    }

    await storeUserKeys(userID, user.publicKey, newEncryptedPrivateKey, newKeySalt);

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500);
    next(error);
  }
}