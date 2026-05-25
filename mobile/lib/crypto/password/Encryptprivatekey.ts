// Encrypts the RSA private key PEM using PBKDF2 (our impl) + ChaCha20 (our impl)
// Mobile port:
//   - removed "import { webcrypto } from 'crypto'" → uses globalThis.crypto directly
//   - replaced Buffer hex conversions with pure-JS bytesToHex / hexToBytes from Bytes.ts

import { pbkdf2 }   from "../primitives/Pbkdf2";
import { chacha20 } from "../primitives/Chacha20";
import { bytesToHex, hexToBytes } from "../utils/Bytes";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  // globalThis.crypto is available in both Node 18+ and React Native / Hermes
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
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
    encryptedPrivateKey: `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`,
    keySalt: bytesToHex(salt),
  };
}

/**
 * Decrypt the RSA private key PEM with the user's password.
 * This is the key operation on the unlock screen — runs PBKDF2 at 310k iterations.
 * On mobile, this will block the JS thread for ~2-4 seconds. Show a loading spinner
 * before calling this function.
 */
export function decryptPrivateKey(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): string {
  const salt = hexToBytes(keySalt);
  const [nonceHex = "", ciphertextHex = ""] = encryptedPrivateKey.split(":");
  const nonce      = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);

  const derivedKey = pbkdf2(password, salt, ITERATIONS, 32);
  const plaintext  = chacha20(derivedKey, nonce, ciphertext);
  return new TextDecoder().decode(plaintext);
}
