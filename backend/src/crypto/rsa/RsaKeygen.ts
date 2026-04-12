// RSA-2048 key generation (random)
// Uses platform crypto.subtle — unavoidable due to big integer math requirements
// Everything else (PBKDF2, ChaCha20, SHA-256, HMAC) is implemented from scratch

import { webcrypto } from "crypto";
import { bufferToPem } from "./RsaDer";

const crypto = webcrypto as unknown as Crypto;

/**
 * Generate a random RSA-2048 key pair.
 * Returns PEM strings for both public and private keys.
 * The private key is returned raw — encrypt it with encryptPrivateKey() before storing.
 */
export async function generateRSAKeyPair(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyBuffer  = await crypto.subtle.exportKey("spki",  keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKeyPem:  bufferToPem(new Uint8Array(publicKeyBuffer),  "PUBLIC KEY"),
    privateKeyPem: bufferToPem(new Uint8Array(privateKeyBuffer), "PRIVATE KEY"),
  };
}
