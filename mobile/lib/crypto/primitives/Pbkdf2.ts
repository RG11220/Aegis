/**
 * PBKDF2-HMAC-SHA256 — RFC 2898 §5.2
 * Tested against RFC 6070 vectors (see Phase 7 test suite).
 */

import { hmacSha256 } from "./Hmac";

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

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = (a[i] as number) ^ (b[i] as number);
  }
  return result;
}

function int32BE(n: number): Uint8Array {
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

export function pbkdf2(
  password: string | Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number
): Uint8Array {
  const passwordBytes =
    typeof password === "string" ? new TextEncoder().encode(password) : password;

  const hashLen = 32; // HMAC-SHA256 output is 32 bytes
  const blocksNeeded = Math.ceil(keyLength / hashLen);
  const result = new Uint8Array(keyLength);

  for (let blockIndex = 1; blockIndex <= blocksNeeded; blockIndex++) {
    let u: Uint8Array = new Uint8Array(
      hmacSha256(passwordBytes, concat(salt, int32BE(blockIndex)))
    );

    let block = new Uint8Array(u.buffer.slice(0));

    for (let i = 1; i < iterations; i++) {
      u = new Uint8Array(new Uint8Array(hmacSha256(passwordBytes, u)).buffer.slice(0));
      block = xorBytes(block, u);
    }

    const offset = (blockIndex - 1) * hashLen;
    const bytesToCopy = Math.min(hashLen, keyLength - offset);
    result.set(new Uint8Array(block.buffer.slice(0, bytesToCopy)), offset);
  }

  return result;
}
