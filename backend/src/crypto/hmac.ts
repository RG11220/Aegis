// HMAC-SHA256 implemented from scratch — RFC 2104

import { sha256 } from "./Sha256";

const BLOCK_SIZE = 64;

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = (a[i] as number) ^ (b[i] as number);
  }
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function hmacSha256(key: Uint8Array | string, message: Uint8Array | string): Uint8Array {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const msgBytes = typeof message === "string" ? new TextEncoder().encode(message) : message;

  const normalizedKey = keyBytes.length > BLOCK_SIZE ? sha256(keyBytes) : keyBytes;

  const paddedKey = new Uint8Array(BLOCK_SIZE);
  paddedKey.set(normalizedKey);

  const ipad = new Uint8Array(BLOCK_SIZE).fill(0x36);
  const opad = new Uint8Array(BLOCK_SIZE).fill(0x5c);

  const innerKey = xorBytes(paddedKey, ipad);
  const outerKey = xorBytes(paddedKey, opad);

  const innerHash = sha256(concat(innerKey, msgBytes));
  return sha256(concat(outerKey, innerHash));
}

export function hmacSha256Hex(key: Uint8Array | string, message: Uint8Array | string): string {
  return Buffer.from(hmacSha256(key, message)).toString("hex");
}