// pbkdf2 seed → chacha20 key+nonce (domain-separated)

import { pbkdf2 } from "../primitives/Pbkdf2";

// domain separator, not a secret
const FIXED_SALT = new TextEncoder().encode("aegis-rsa-v1");

const ITERATIONS = 100_000;

// 44 bytes: [0-31]=key, [32-43]=nonce
export function keyMaterialFromSeed(seedString: string): { key: Uint8Array; nonce: Uint8Array } {
  const derived = pbkdf2(seedString, FIXED_SALT, ITERATIONS, 44);
  return {
    key:   derived.slice(0, 32),
    nonce: derived.slice(32, 44),
  };
}
