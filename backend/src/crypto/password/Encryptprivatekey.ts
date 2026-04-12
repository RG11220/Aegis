// Encrypts the RSA private key PEM using PBKDF2 (our impl) + ChaCha20 (our impl)

import { pbkdf2 }   from "../primitives/Pbkdf2";
import { chacha20 } from "../primitives/Chacha20";
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
  const ciphertext = chacha20(derivedKey, nonce, new TextEncoder().encode(privateKeyPem));

  return {
    encryptedPrivateKey: `${Buffer.from(nonce).toString("hex")}:${Buffer.from(ciphertext).toString("hex")}`,
    keySalt: Buffer.from(salt).toString("hex"),
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
  const salt = Buffer.from(keySalt, "hex");
  const [nonceHex = "", ciphertextHex = ""] = encryptedPrivateKey.split(":");
  const nonce      = Buffer.from(nonceHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const derivedKey = pbkdf2(password, salt, ITERATIONS, 32);
  const plaintext  = chacha20(derivedKey, nonce, ciphertext);
  return new TextDecoder().decode(plaintext);
}
