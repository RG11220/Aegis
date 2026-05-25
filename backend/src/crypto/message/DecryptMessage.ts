/**
 * Message decryption orchestration — Phase 4.
 *
 * Reverses EncryptMessage.ts:
 *   1. Verify RSA-PKCS#1 v1.5 signature  — reject immediately if invalid
 *   2. RSA-OAEP unwrap the recipient's AES key from encryptedKeys[myUserId]
 *   3. AES-256-CTR decrypt the ciphertext → plaintext
 *
 * Decryption is always performed client-side (mobile app).
 * The server is a blind relay and never calls this function.
 *
 * Canonical string verified:
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 *   (must match EncryptMessage.ts exactly)
 */

import { aesDecrypt, hexToBytes } from "../primitives/Aes256";
import { rsaOaepDecrypt }         from "../rsa/RsaOaep";
import { rsaVerify }              from "../rsa/RsaSign";
import type { EncryptedPackage }  from "./EncryptMessage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecryptMessageParams {
  /** The encrypted package as stored in Mongo / received over the socket. */
  pkg: EncryptedPackage;
  /** The chat's MongoDB ObjectId string (used to reconstruct the canonical string). */
  chatId: string;
  /** The sender's userId (used in the canonical string). */
  senderId: string;
  /** SPKI PEM public key of the sender — used to verify the signature. */
  senderPublicKeyPem: string;
  /** The decrypting user's userId — used to look up their wrapped key in encryptedKeys. */
  myUserId: string;
  /** PKCS#8 PEM private key of the decrypting user — used to unwrap the AES key. */
  myPrivateKeyPem: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Decrypt an encrypted message package.
 *
 * Throws if:
 *   - The signature is invalid or was tampered with
 *   - myUserId is not in encryptedKeys (message was not encrypted for this user)
 *   - RSA-OAEP decryption fails (wrong private key or corrupted key blob)
 *
 * @returns UTF-8 plaintext string
 */
export function decryptMessage(params: DecryptMessageParams): string {
  const { pkg, chatId, senderId, senderPublicKeyPem, myUserId, myPrivateKeyPem } = params;
  const { cipherText, iv, encryptedKeys, signature } = pkg;

  // 1. Verify the sender's signature before touching any crypto.
  //    An invalid signature means the message was tampered with or is not from the claimed sender.
  const canonical = `${senderId}:${chatId}:${iv}:${cipherText}`;
  const valid = rsaVerify(senderPublicKeyPem, canonical, signature);
  if (!valid) {
    throw new Error("DecryptMessage: invalid signature — message rejected");
  }

  // 2. Look up this user's wrapped AES key.
  const wrappedKeyB64 = encryptedKeys[myUserId];
  if (!wrappedKeyB64) {
    throw new Error(`DecryptMessage: no encrypted key found for userId "${myUserId}"`);
  }

  // 3. RSA-OAEP unwrap the AES key with the recipient's private key.
  const wrappedKeyBytes = Uint8Array.from(Buffer.from(wrappedKeyB64, "base64"));
  const aesKey = rsaOaepDecrypt(myPrivateKeyPem, wrappedKeyBytes);

  // 4. AES-256-CTR decrypt the ciphertext.
  const ciphertextBytes = hexToBytes(cipherText);
  const ivBytes         = hexToBytes(iv);
  const plaintextBytes  = aesDecrypt(aesKey, ivBytes, ciphertextBytes);

  return new TextDecoder().decode(plaintextBytes);
}
