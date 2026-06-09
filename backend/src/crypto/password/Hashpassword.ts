import { pbkdf2 } from "../primitives/Pbkdf2";
import { webcrypto } from "crypto";

const ITERATIONS = 310_000;
const KEY_LENGTH  = 32;

function getRandomBytes(length: number): Uint8Array {
  return (webcrypto as unknown as Crypto).getRandomValues(new Uint8Array(length));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = getRandomBytes(16);
  const hash = pbkdf2(password, salt, ITERATIONS, KEY_LENGTH);
  return `${Buffer.from(salt).toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex = "", storedHash = ""] = stored.split(":");
  const salt    = Buffer.from(saltHex, "hex");
  const hash    = pbkdf2(password, salt, ITERATIONS, KEY_LENGTH);
  const hashHex = Buffer.from(hash).toString("hex");

  // constant-time compare, no early exit
  if (hashHex.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++)
    diff |= hashHex.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}
