// Encrypts the RSA private key PEM using PBKDF2 (our impl) + ChaCha20 (our impl)
// with HMAC-SHA256 integrity protection (encrypt-then-MAC).
//
// Mobile port:
//   - removed "import { webcrypto } from 'crypto'" → uses globalThis.crypto directly
//   - replaced Buffer hex conversions with pure-JS bytesToHex / hexToBytes from Bytes.ts

import { pbkdf2 }     from "../primitives/Pbkdf2";
import { chacha20 }   from "../primitives/Chacha20";
import { hmacSha256 } from "../primitives/Hmac";
import { bytesToHex, hexToBytes } from "../utils/Bytes";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  // globalThis.crypto is available in both Node 18+ and React Native / Hermes
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function deriveKeyAsync(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLength: number
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const key = await subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        // .slice() guarantees the backing buffer is a plain ArrayBuffer,
        // not SharedArrayBuffer — required by the SubtleCrypto typings.
        salt: salt.slice(0),
        iterations,
      },
      key,
      keyLength * 8
    );

    return new Uint8Array(derivedBits);
  }

  return pbkdf2(password, salt, iterations, keyLength);
}

/**
 * Encrypt the RSA private key PEM with the user's password.
 *
 * Derives 64 bytes from PBKDF2 (encrypt-then-MAC):
 *  - bytes  0–31 → ChaCha20 encryption key
 *  - bytes 32–63 → HMAC-SHA256 MAC key
 *
 * MAC covers nonce || ciphertext so the tag binds both.
 *
 * Returns:
 *  - encryptedPrivateKey: "nonceHex:ciphertextHex:macHex"
 *  - keySalt: hex string
 */
export function encryptPrivateKey(
  privateKeyPem: string,
  password: string
): { encryptedPrivateKey: string; keySalt: string } {
  const salt  = getRandomBytes(16);
  const nonce = getRandomBytes(12);

  // Derive 64 bytes: first half for encryption, second half for authentication
  const material = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  const ciphertext = chacha20(encKey, nonce, new TextEncoder().encode(privateKeyPem));

  // Encrypt-then-MAC: MAC covers nonce || ciphertext
  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const mac = hmacSha256(macKey, macInput);

  return {
    encryptedPrivateKey: `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}:${bytesToHex(mac)}`,
    keySalt: bytesToHex(salt),
  };
}

/**
 * Decrypt the RSA private key PEM with the user's password.
 *
 * Verifies the HMAC-SHA256 tag before decrypting (authenticate-then-decrypt).
 * Throws if the MAC is invalid — indicates wrong password or corrupted data.
 * Throws if the decrypted result is not a valid PEM key.
 *
 * This runs PBKDF2 at 310k iterations — blocks the JS thread for ~2–4 seconds.
 * Show a loading indicator before calling this function.
 */
export function decryptPrivateKey(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): string {
  const salt  = hexToBytes(keySalt);
  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) throw new Error("decryptPrivateKey: invalid format (expected nonce:ciphertext:mac)");

  const [nonceHex, ciphertextHex, macHex] = parts as [string, string, string];
  const nonce      = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const storedMac  = hexToBytes(macHex);

  // Derive 64 bytes (same split as encryption)
  const material = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  // Verify MAC before decrypting — prevents wrong-password silent garbage
  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);
  if (!constantTimeEqual(storedMac, expectedMac)) {
    throw new Error("decryptPrivateKey: MAC verification failed — wrong password or corrupted data");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  const pem = new TextDecoder().decode(plaintext);

  // Sanity check — a valid PKCS#8 PEM always starts with this header
  if (!pem.startsWith("-----BEGIN")) {
    throw new Error("decryptPrivateKey: decrypted output is not a valid PEM key");
  }

  return pem;
}

export async function decryptPrivateKeyAsync(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): Promise<string> {
  const salt  = hexToBytes(keySalt);
  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) throw new Error("decryptPrivateKeyAsync: invalid format (expected nonce:ciphertext:mac)");

  const [nonceHex, ciphertextHex, macHex] = parts as [string, string, string];
  const nonce      = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const storedMac  = hexToBytes(macHex);

  // Derive 64 bytes (same split as encryption)
  const material = await deriveKeyAsync(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);
  if (!constantTimeEqual(storedMac, expectedMac)) {
    throw new Error("decryptPrivateKeyAsync: MAC verification failed — wrong password or corrupted data");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  const pem = new TextDecoder().decode(plaintext);

  if (!pem.startsWith("-----BEGIN")) {
    throw new Error("decryptPrivateKeyAsync: decrypted output is not a valid PEM key");
  }

  return pem;
}
