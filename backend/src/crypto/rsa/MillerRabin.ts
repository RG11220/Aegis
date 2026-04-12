// Deterministic Miller-Rabin primality test + seeded prime generation
// Witnesses cover all numbers < 2^64 with certainty (no false positives)

import { modPow, bytesToBigInt }  from "./RsaMath";
import type { SeededRng }         from "../seed/SeededRng";

// Deterministic witness set — sufficient for provable correctness up to 2^64
const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  // Write n-1 as 2^r * d
  let r = 0n, d = n - 1n;
  while (d % 2n === 0n) { d /= 2n; r++; }

  witnessLoop: for (const a of WITNESSES) {
    if (a >= n) continue;
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 0n; i < r - 1n; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witnessLoop;
    }
    return false; // composite
  }

  return true;
}

/**
 * Generate a 1024-bit prime deterministically from the seeded RNG.
 * - Top two bits set → guarantees full 1024-bit magnitude
 * - Bottom bit set  → guarantees odd candidate
 */
export function generatePrime(rng: SeededRng): bigint {
  while (true) {
    const bytes = rng.nextBytes(128); // 1024 bits
    bytes[0]!   |= 0xc0;             // set top two bits
    bytes[127]! |= 0x01;             // set bottom bit (odd)

    const candidate = bytesToBigInt(bytes);
    if (isPrime(candidate)) return candidate;
  }
}
