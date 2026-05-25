/**
 * Random RSA-2048 keypair generation for mobile sign-up.
 *
 * Unlike RsaFromSeed.ts this does NOT run PBKDF2 first — it feeds
 * raw random bytes directly into the ChaCha20 PRNG so the only heavy
 * work is the Miller-Rabin prime search (typically < 1 s on device).
 *
 * The keypair is NOT deterministic across calls — use this for account
 * creation, not for seed-phrase-based key recovery.
 */

import { makeSeededRng }                        from "../seed/SeededRng";
import { generatePrime }                        from "./MillerRabin";
import { modInverse, gcd }                      from "./RsaMath";
import { encodeSpki, encodePkcs8, bufferToPem } from "./RsaDer";

const E = 65537n;

/**
 * Generate a random RSA-2048 keypair.
 * Returns PEM strings ready to use with the rest of the crypto layer.
 *
 * Timing: ~200-800 ms on a mid-range phone (prime search varies).
 * Show a brief "Setting up your account…" indicator while this runs.
 */
export async function generateRandomRSAKeyPair(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}> {
  // Use fresh random bytes as the PRNG seed — no PBKDF2 needed.
  const key   = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const rng   = makeSeededRng(key, nonce);

  let p: bigint, q: bigint, d: bigint;

  while (true) {
    p = generatePrime(rng);
    q = generatePrime(rng);
    if (p === q) continue;

    const n = p * q;
    if (n >> 2047n === 0n) continue; // must be full 2048-bit

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
