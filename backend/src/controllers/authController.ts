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

// GET /auth/me — returns the current logged-in user from SQL
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

    // Validate seed phrase if provided (24 unique known words)
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

    // Email the seed phrase to the user — non-fatal if it fails
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

// POST /auth/provision-keys — generates the user's RSA keypair ON THE SERVER and stores it.
// Used because pure-JS RSA-2048 keygen is too slow on a phone (freezes the JS thread).
// The server generates the seed + keypair, encrypts the private key with the user's
// password (PBKDF2 + ChaCha20), hashes the password, stores everything, and emails the
// recovery words. It returns the keys so the client can hold them in its session.
//
// Trade-off: the server briefly handles the plaintext private key + password before
// encrypting them (key escrow). Message encryption/decryption still happens client-side.
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

    // Generate deterministically from a fresh random seed phrase (fast on the server).
    const seedPhrase = generateSeedPhrase();
    const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(seedPhrase);
    const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);
    const hashedPassword = await hashPassword(password);

    await provisionUserCrypto(userID, hashedPassword, publicKeyPem, encryptedPrivateKey, keySalt);

    // Email the recovery words — non-fatal if delivery fails (keys are already stored).
    try {
      await sendSeedPhraseEmail(user.UserEmail, user.userName, seedPhrase);
    } catch (emailErr) {
      console.error("[provisionKeys] Seed phrase email failed (keys stored OK):", emailErr);
    }

    // Return the keys so the client can keep them in memory for this session.
    res.status(200).json({ publicKey: publicKeyPem, privateKey: privateKeyPem });
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

    // Atomic upsert — no race condition possible.
    // ON DUPLICATE KEY fires on the unique email constraint (existing accounts).
    // clerkId = VALUES(clerkId) ensures stale / migrated clerkIds get corrected
    // so the follow-up SELECT WHERE clerkId = ? always finds the row.
    await execute(
      `INSERT INTO Users (userName, userEmail, profilePicture, clerkId)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         clerkId        = VALUES(clerkId),
         userName       = VALUES(userName),
         profilePicture = VALUES(profilePicture)`,
      [name, email, avatar, clerkId]
    ) as [ResultSetHeader, unknown];

    // Fetch the final user record (works for both insert and update).
    // Falls back to email lookup in case a concurrent process beat us to the upsert
    // and the clerkId column wasn't updated yet.
    let [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE clerkId = ? LIMIT 1",
      [clerkId]
    ) as [ClerkUserRow[], unknown];

    if (!rows[0] && email) {
      // Safety net: look up by email and patch the clerkId
      const [emailRows] = await execute(
        "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userEmail = ? LIMIT 1",
        [email]
      ) as [ClerkUserRow[], unknown];

      if (emailRows[0]) {
        await execute(
          "UPDATE Users SET clerkId = ? WHERE userEmail = ?",
          [clerkId, email]
        );
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

// POST /auth/recover-keys — re-encrypt the private key with a new password.
// Called when a user has forgotten their password and wants to recover via seed phrase.
//
// Security model:
//   The 24 seed words deterministically reproduce the RSA keypair.
//   The server derives the public key from the provided words and checks it against
//   the stored public key — only someone with the correct seed phrase can pass this check.
//   Requires Clerk auth (user must be signed in with their new Clerk password already).
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

    // Derive the RSA keypair from the provided seed words on the server.
    // If the words are correct, the resulting public key matches the stored one.
    let derivedPublicKey: string;
    try {
      const { publicKeyPem } = await generateRSAKeyPairFromSeed(words);
      derivedPublicKey = publicKeyPem;
    } catch (err: any) {
      res.status(400).json({ message: `Invalid seed phrase: ${err.message}` });
      return;
    }

    // Normalise whitespace before comparing (PEM lines may differ by platform)
    const normalise = (pem: string) => pem.replace(/\s+/g, "");
    if (normalise(derivedPublicKey) !== normalise(user.publicKey)) {
      res.status(403).json({ message: "Seed phrase does not match the keys for this account" });
      return;
    }

    // Public key verified — update the encrypted private key with the new password wrapping.
    await storeUserKeys(userID, user.publicKey, newEncryptedPrivateKey, newKeySalt);

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500);
    next(error);
  }
}