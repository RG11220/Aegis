// encrypt: AES-256-CTR + RSA-OAEP key wrap + PKCS1v15 signature

import { aesEncrypt, bytesToHex } from "../primitives/Aes256";
import { rsaOaepEncrypt }         from "../rsa/RsaOaep";
import { rsaSign }                from "../rsa/RsaSign";
import { bytesToBase64 }          from "../utils/Bytes";


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
