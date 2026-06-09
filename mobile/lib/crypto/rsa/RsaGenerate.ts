// random RSA-2048 keygen (not deterministic, use for account creation)

import { makeSeededRng }                        from "../seed/SeededRng";
import { generatePrime }                        from "./MillerRabin";
import { modInverse, gcd }                      from "./RsaMath";
import { encodeSpki, encodePkcs8, bufferToPem } from "./RsaDer";

const E = 65537n;

// ~200-800ms on device
export async function generateRandomRSAKeyPair(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}> {
  // fresh random seed, skip pbkdf2
  const key   = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const rng   = makeSeededRng(key, nonce);

  let p: bigint, q: bigint, d: bigint;

  while (true) {
    p = generatePrime(rng);
    q = generatePrime(rng);
    if (p === q) continue;

    const n = p * q;
    if (n >> 2047n === 0n) continue; // need full 2048-bit

    const p1     = p - 1n;
    const q1     = q - 1n;
    const lambda = (p1 / gcd(p1, q1)) * q1;

    if (lambda % E === 0n) continue;

    d = modInverse(E, lambda);
    break;
  }

  const n    = p! * q!;
  const dp   = d! % (p! - 1n);
  const dq   = d! % (q! - 1n);
  const qInv = modInverse(q!, p!);

  return {
    publicKeyPem:  bufferToPem(encodeSpki(n, E),                            "PUBLIC KEY"),
    privateKeyPem: bufferToPem(encodePkcs8(n, E, d!, p!, q!, dp, dq, qInv), "PRIVATE KEY"),
  };
}
