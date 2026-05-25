/**
 * Message encryption orchestration — Phase 4.
 *
 * Encrypts a plaintext message for one or more recipients using:
 *   1. Random AES-256-CTR key + IV  (one per message)
 *   2. RSA-OAEP-SHA256              (wraps the AES key per recipient, including sender)
 *   3. RSA-PKCS#1 v1.5 / SHA-256   (signs the canonical package with sender's private key)
 *
 * The server stores and relays only the output of this function —
 * it never sees the plaintext or the AES key in the clear.
 *
 * Canonical string signed:
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 *   (all hex/string, colon-delimited — matches RsaSign.ts and DecryptMessage.ts)
 */

import { aesEncrypt, bytesToHex } from "../primitives/Aes256";
import { rsaOaepEncrypt }         from "../rsa/RsaOaep";
import { rsaSign }                from "../rsa/RsaSign";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Recipient {
  /** Internal userId (MySQL userID as string, or Clerk ID — must match encryptedKeys map key). */
  userId: string;
  /** SPKI PEM public key ("-----BEGIN PUBLIC KEY-----"). */
  publicKeyPem: string;
}

export interface EncryptedPackage {
  /** Hex-encoded AES-256-CTR ciphertext. */
  cipherText: string;
  /** Hex-encoded 16-byte random IV used for AES-CTR. */
  iv: string;
  /**
   * Map of userId → base64-encoded RSA-OAEP ciphertext of the AES key.
   * Both sender and all recipients are included so anyone in the conversation
   * can decrypt their own copy using their private key.
   */
  encryptedKeys: Record<string, string>;
  /**
   * Hex-encoded RSA-PKCS#1 v1.5 signature over the canonical string
   * `${senderId}:${chatId}:${iv}:${cipherText}`.
   */
  signature: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message for a set of recipients.
 *
 * @param plaintext          UTF-8 message text
 * @param senderId           The sender's userId (used in canonical string + encryptedKeys map)
 * @param chatId             The chat's MongoDB ObjectId string (used in canonical string)
 * @param senderPrivateKeyPem  PKCS#8 PEM private key of the sender (for OAEP self-wrap + signing)
 * @param recipients         Array of { userId, publicKeyPem } — include the sender here too
 *                           so the sender can re-read their own messages.
 * @returns                  EncryptedPackage ready to store in Mongo and relay to clients
 */
export function encryptMessage(
  plaintext: string,
  senderId: string,
  chatId: string,
  senderPrivateKeyPem: string,
  recipients: Recipient[]
): EncryptedPackage {
  if (recipients.length === 0) throw new Error("encryptMessage: recipients list is empty");

  // 1. Generate a random 32-byte AES-256 key and 16-byte IV.
  const aesKey = new Uint8Array(32);
  const iv     = new Uint8Array(16);
  globalThis.crypto.getRandomValues(aesKey);
  globalThis.crypto.getRandomValues(iv);

  // 2. AES-256-CTR encrypt the plaintext.
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBytes = aesEncrypt(aesKey, iv, plaintextBytes);

  const ivHex         = bytesToHex(iv);
  const cipherTextHex = bytesToHex(ciphertextBytes);

  // 3. RSA-OAEP wrap the AES key for each recipient (and sender).
  const encryptedKeys: Record<string, string> = {};
  for (const { userId, publicKeyPem } of recipients) {
    const wrappedKey = rsaOaepEncrypt(publicKeyPem, aesKey);
    encryptedKeys[userId] = Buffer.from(wrappedKey).toString("base64");
  }

  // 4. Sign the canonical package with the sender's private key.
  const canonical = `${senderId}:${chatId}:${ivHex}:${cipherTextHex}`;
  const signature  = rsaSign(senderPrivateKeyPem, canonical);

  return {
    cipherText: cipherTextHex,
    iv: ivHex,
    encryptedKeys,
    signature,
  };
}
