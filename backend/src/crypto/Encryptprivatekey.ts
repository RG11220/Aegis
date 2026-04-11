// Encrypts the RSA private key PEM using PBKDF2 (our impl) + ChaCha20 (our impl)

import { pbkdf2 } from "./Pbkdf2";
import { chacha20 } from "./Chacha20";
import { webcrypto } from "crypto";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  return (webcrypto as unknown as Crypto).getRandomValues(new Uint8Array(length));
}

/**
 * Encrypt the RSA private key PEM with the user's password.
 * Returns:
 *  - encryptedPrivateKey: "nonceHex:ciphertextHex"
 *  - keySalt: hex string
 */
export function encryptPrivateKey(
  privateKeyPem: string,
  password: string
): { encryptedPrivateKey: string; keySalt: string } {
  const salt  = getRandomBytes(16);
  const nonce = getRandomBytes(12);

  const derivedKey = pbkdf2(password, salt, ITERATIONS, 32);

  const plaintext  = new TextEncoder().encode(privateKeyPem);
  const ciphertext = chacha20(derivedKey, nonce, plaintext);

  const nonceHex      = Buffer.from(nonce).toString("hex");
  const ciphertextHex = Buffer.from(ciphertext).toString("hex");
  const saltHex       = Buffer.from(salt).toString("hex");

  return {
    encryptedPrivateKey: `${nonceHex}:${ciphertextHex}`,
    keySalt: saltHex,
  };
}

/**
 * Decrypt the RSA private key PEM with the user's password.
 */
export function decryptPrivateKey(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): string {
  const salt  = Buffer.from(keySalt, "hex");
  const parts = encryptedPrivateKey.split(":");
  const nonce      = Buffer.from(parts[0] ?? "", "hex");
  const ciphertext = Buffer.from(parts[1] ?? "", "hex");

  const derivedKey = pbkdf2(password, salt, ITERATIONS, 32);
  const plaintext  = chacha20(derivedKey, nonce, ciphertext);

  return new TextDecoder().decode(plaintext);
}