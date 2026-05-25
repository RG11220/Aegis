// Derives a deterministic ChaCha20 key + nonce from a numeric seed string
// Uses PBKDF2-HMAC-SHA256 with a fixed public salt (domain separator)

import { pbkdf2 } from "../primitives/Pbkdf2";

// Fixed salt — not a secret, just a domain separator.
// Prevents cross-application key reuse and pre-computation attacks.
const FIXED_SALT = new TextEncoder().encode("aegis-rsa-v1");

// 100k iterations: slow enough to resist brute-force, fast enough for UX
const ITERATIONS = 100_000;

/**
 * Derive 44 bytes from the seed string:
 *   bytes  0–31 → ChaCha20 key  (32 bytes)
 *   bytes 32–43 → ChaCha20 nonce (12 bytes)
 */
export function keyMaterialFromSeed(seedString: string): { key: Uint8Array; nonce: Uint8Array } {
  const derived = pbkdf2(seedString, FIXED_SALT, ITERATIONS, 44);
  return {
    key:   derived.slice(0, 32),
    nonce: derived.slice(32, 44),
  };
}
