// deterministic PRNG via ChaCha20 keystream

import { chacha20 } from "../primitives/Chacha20";

export type SeededRng = ReturnType<typeof makeSeededRng>;

export function makeSeededRng(key: Uint8Array, nonce: Uint8Array) {
  let counter = 1;

  return {
    nextBytes(n: number): Uint8Array {
      const zeros  = new Uint8Array(n); // xor zeros = raw keystream
      const stream = chacha20(key, nonce, zeros, counter);
      counter += Math.ceil(n / 64); // advance counter
      return stream;
    },
  };
}
