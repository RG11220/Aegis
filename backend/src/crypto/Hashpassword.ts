// Password hashing using our custom PBKDF2-HMAC-SHA256
// Stores as "saltHex:hashHex"

import { pbkdf2 } from "./Pbkdf2";
import { webcrypto } from "crypto";

const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

function getRandomBytes(length: number): Uint8Array {
  return (webcrypto as unknown as Crypto).getRandomValues(new Uint8Array(length));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = getRandomBytes(16);
  const hash = pbkdf2(password, salt, ITERATIONS, KEY_LENGTH);

  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(hash).toString("hex");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  const saltHex = parts[0] ?? "";
  const storedHash = parts[1] ?? "";

  const salt = Buffer.from(saltHex, "hex");
  const hash = pbkdf2(password, salt, ITERATIONS, KEY_LENGTH);
  const hashHex = Buffer.from(hash).toString("hex");

  // Constant-time comparison to prevent timing attacks
  if (hashHex.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= (hashHex.charCodeAt(i)) ^ (storedHash.charCodeAt(i));
  }
  return diff === 0;
}