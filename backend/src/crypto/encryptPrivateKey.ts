// Encrypts the RSA private key PEM using PBKDF2 + ChaCha20 + HMAC-SHA256 (Encrypt-then-MAC)

import { pbkdf2 } from "./pbkdf2";
import { chacha20 } from "./Chacha20";
import { hmacSha256 } from "./Hmacmac";
import { webcrypto } from "crypto";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  return (webcrypto as unknown as Crypto).getRandomValues(new Uint8Array(length));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

/**
 * Encrypt the RSA private key PEM with the user's password.
 * Uses Encrypt-then-MAC: ChaCha20 encryption + HMAC-SHA256 authentication.
 * 
 * Stored format: "nonceHex:ciphertextHex:macHex"
 * keySalt stored separately in DB.
 * 
 * Two keys are derived from PBKDF2:
 *  - bytes 0–31:  ChaCha20 encryption key
 *  - bytes 32–63: HMAC-SHA256 authentication key
 */
export function encryptPrivateKey(
  privateKeyPem: string,
  password: string
): { encryptedPrivateKey: string; keySalt: string } {
  const salt  = getRandomBytes(16);
  const nonce = getRandomBytes(12);

  // Derive 64 bytes: first 32 for encryption, last 32 for MAC
  const keyMaterial = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey = keyMaterial.slice(0, 32);
  const macKey = keyMaterial.slice(32, 64);

  const plaintext  = new TextEncoder().encode(privateKeyPem);
  const ciphertext = chacha20(encKey, nonce, plaintext);

  // MAC over: salt || nonce || ciphertext (authenticate everything)
  const macInput = new Uint8Array(salt.length + nonce.length + ciphertext.length);
  macInput.set(salt, 0);
  macInput.set(nonce, salt.length);
  macInput.set(ciphertext, salt.length + nonce.length);
  const mac = hmacSha256(macKey, macInput);

  const nonceHex      = Buffer.from(nonce).toString("hex");
  const ciphertextHex = Buffer.from(ciphertext).toString("hex");
  const macHex        = Buffer.from(mac).toString("hex");
  const saltHex       = Buffer.from(salt).toString("hex");

  return {
    encryptedPrivateKey: `${nonceHex}:${ciphertextHex}:${macHex}`,
    keySalt: saltHex,
  };
}

/**
 * Decrypt the RSA private key PEM with the user's password.
 * Verifies the MAC before decrypting — rejects tampered or wrong-password data.
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
  const storedMac  = Buffer.from(parts[2] ?? "", "hex");

  // Re-derive the same two keys
  const keyMaterial = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey = keyMaterial.slice(0, 32);
  const macKey = keyMaterial.slice(32, 64);

  // Recompute MAC and verify BEFORE decrypting
  const macInput = new Uint8Array(salt.length + nonce.length + ciphertext.length);
  macInput.set(salt, 0);
  macInput.set(nonce, salt.length);
  macInput.set(ciphertext, salt.length + nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);

  if (!constantTimeEqual(new Uint8Array(storedMac), expectedMac)) {
    throw new Error("Decryption failed: authentication tag mismatch");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  return new TextDecoder().decode(plaintext);
}