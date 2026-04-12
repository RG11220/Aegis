// Deterministic PRNG backed by ChaCha20 keystream
// XOR against zeros = raw keystream output
// Counter advances per call so output is never reused

import { chacha20 } from "../primitives/Chacha20";

export type SeededRng = ReturnType<typeof makeSeededRng>;

/**
 * Create a stateful deterministic RNG from a ChaCha20 key + nonce.
 * Each call to nextBytes(n) advances the internal counter by ceil(n/64) blocks,
 * guaranteeing no byte is ever produced twice.
 */
export function makeSeededRng(key: Uint8Array, nonce: Uint8Array) {
  let counter = 1;

  return {
    nextBytes(n: number): Uint8Array {
      const zeros  = new Uint8Array(n);          // XOR against zeros → raw keystream
      const stream = chacha20(key, nonce, zeros, counter);
      counter += Math.ceil(n / 64);              // advance past consumed blocks
      return stream;
    },
  };
}
