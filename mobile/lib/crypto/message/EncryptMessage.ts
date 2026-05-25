/**
 * Message encryption orchestration — Phase 4.
 * Mobile port: replaces Buffer.from().toString("base64") with pure-JS bytesToBase64.
 *
 * Encrypts a plaintext message for one or more recipients using:
 *   1. Random AES-256-CTR key + IV  (one per message)
 *   2. RSA-OAEP-SHA256              (wraps the AES key per recipient, including sender)
 *   3. RSA-PKCS#1 v1.5 / SHA-256   (signs the canonical package with sender's private key)
 *
 * Canonical string signed:
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 */

import { aesEncrypt, bytesToHex } from "../primitives/Aes256";
import { rsaOaepEncrypt }         from "../rsa/RsaOaep";
import { rsaSign }                from "../rsa/RsaSign";
import { bytesToBase64 }          from "../utils/Bytes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Recipient {
  userId: string;
  publicKeyPem: string;
}

export interface EncryptedPackage {
  cipherText: string;
  iv: string;
  encryptedKeys: Record<string, string>;
  signature: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function encryptMessage(
  plaintext: string,
  senderId: string,
  chatId: string,
  senderPrivateKeyPem: string,
  recipients: Recipient[]
): EncryptedPackage {
  if (recipients.length === 0) throw new Error("encryptMessage: recipients list is empty");

  const aesKey = new Uint8Array(32);
  const iv     = new Uint8Array(16);
  globalThis.crypto.getRandomValues(aesKey);
  globalThis.crypto.getRandomValues(iv);

  const plaintextBytes  = new TextEncoder().encode(plaintext);
  const ciphertextBytes = aesEncrypt(aesKey, iv, plaintextBytes);

  const ivHex         = bytesToHex(iv);
  const cipherTextHex = bytesToHex(ciphertextBytes);

  const encryptedKeys: Record<string, string> = {};
  for (const { userId, publicKeyPem } of recipients) {
    const wrappedKey = rsaOaepEncrypt(publicKeyPem, aesKey);
    // No Buffer — pure-JS base64 encode
    encryptedKeys[userId] = bytesToBase64(wrappedKey);
  }

  const canonical = `${senderId}:${chatId}:${ivHex}:${cipherTextHex}`;
  const signature  = rsaSign(senderPrivateKeyPem, canonical);

  return {
    cipherText: cipherTextHex,
    iv: ivHex,
    encryptedKeys,
    signature,
  };
}
