/**
 * Message decryption orchestration — Phase 4.
 * Mobile port: replaces Buffer.from(b64, "base64") with pure-JS base64ToBytes.
 *
 * Reverses EncryptMessage.ts:
 *   1. Verify RSA-PKCS#1 v1.5 signature  — reject immediately if invalid
 *   2. RSA-OAEP unwrap the recipient's AES key from encryptedKeys[myUserId]
 *   3. AES-256-CTR decrypt the ciphertext → plaintext
 *
 * Canonical string verified:
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 */

import { aesDecrypt, hexToBytes } from "../primitives/Aes256";
import { rsaOaepDecrypt }         from "../rsa/RsaOaep";
import { rsaVerify }              from "../rsa/RsaSign";
import { base64ToBytes }          from "../utils/Bytes";
import type { EncryptedPackage }  from "./EncryptMessage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecryptMessageParams {
  pkg: EncryptedPackage;
  chatId: string;
  senderId: string;
  senderPublicKeyPem: string;
  myUserId: string;
  myPrivateKeyPem: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function decryptMessage(params: DecryptMessageParams): string {
  const { pkg, chatId, senderId, senderPublicKeyPem, myUserId, myPrivateKeyPem } = params;
  const { cipherText, iv, encryptedKeys, signature } = pkg;

  // 1. Verify signature before touching any crypto.
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

  // 3. RSA-OAEP unwrap — no Buffer, pure-JS base64 decode.
  const wrappedKeyBytes = base64ToBytes(wrappedKeyB64);
  const aesKey = rsaOaepDecrypt(myPrivateKeyPem, wrappedKeyBytes);

  // 4. AES-256-CTR decrypt.
  const ciphertextBytes = hexToBytes(cipherText);
  const ivBytes         = hexToBytes(iv);
  const plaintextBytes  = aesDecrypt(aesKey, ivBytes, ciphertextBytes);

  return new TextDecoder().decode(plaintextBytes);
}
