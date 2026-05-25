// Deterministic Miller-Rabin primality test + seeded prime generation
//
// isPrime()        — 12 deterministic witnesses, proven correct for n < 3.3 × 10^24 (~2^82).
//                    Used as a fast prefilter to cheaply reject most composites.
// isProbablePrime() — 40 random-witness rounds via the SeededRng.
//                    Error probability < 4^{-40} ≈ 2^{-80} per candidate.
// generatePrime()  — calls both; safe for 1024-bit RSA primes.

import { modPow, bytesToBigInt } from "./RsaMath";
import type { SeededRng }        from "../seed/SeededRng";

// ── Deterministic prefilter (covers n < ~2^82 with no false positives) ────────

const DETERMINISTIC_WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  // Write n-1 as 2^r * d
  let r = 0n, d = n - 1n;
  while (d % 2n === 0n) { d /= 2n; r++; }

  witnessLoop: for (const a of DETERMINISTIC_WITNESSES) {
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

// ── Probabilistic rounds with random witnesses ─────────────────────────────────

const RANDOM_WITNESS_ROUNDS = 40; // error probability < 4^{-40} ≈ 2^{-80}

/**
 * Additional probabilistic Miller-Rabin rounds using random witnesses drawn
 * from the SeededRng.  Call this after isPrime() to get cryptographic confidence
 * for numbers beyond 2^82 (e.g. 1024-bit RSA primes).
 */
function isProbablePrime(n: bigint, rng: SeededRng, rounds: number): boolean {
  if (n < 4n) return true;

  // Write n-1 as 2^r * d
  let r = 0n, d = n - 1n;
  while (d % 2n === 0n) { d /= 2n; r++; }

  const nMinus1 = n - 1n;
  // Number of bytes needed to represent a random value in [0, n)
  const nBytes = Math.ceil(n.toString(16).length / 2);

  for (let i = 0; i < rounds; i++) {
    // Pick a random witness a in [2, n-2]
    const aBytes = rng.nextBytes(nBytes);
    // Reduce mod (n-3) and add 2 → range [2, n-1]
    let a = bytesToBigInt(aBytes) % (nMinus1 - 2n) + 2n;
    if (a < 2n) a = 2n; // safeguard for very small n

    let x = modPow(a, d, n);
    if (x === 1n || x === nMinus1) continue;

    let probably = false;
    for (let j = 0n; j < r - 1n; j++) {
      x = (x * x) % n;
      if (x === nMinus1) { probably = true; break; }
    }
    if (!probably) return false; // composite
  }

  return true;
}

// ── Prime generation ──────────────────────────────────────────────────────────

/**
 * Generate a 1024-bit prime from the seeded RNG.
 *
 * Candidates are filtered by:
 *  1. isPrime()         — deterministic MR with 12 witnesses (fast, no RNG cost)
 *  2. isProbablePrime() — 40 random-witness MR rounds for cryptographic confidence
 *
 * - Top two bits set → guarantees full 1024-bit magnitude
 * - Bottom bit set   → guarantees odd candidate
 */
export function generatePrime(rng: SeededRng): bigint {
  while (true) {
    const bytes = rng.nextBytes(128); // 1024 bits
    bytes[0]!   |= 0xc0;             // set top two bits
    bytes[127]! |= 0x01;             // set bottom bit (odd)

    const candidate = bytesToBigInt(bytes);
    if (isPrime(candidate) && isProbablePrime(candidate, rng, RANDOM_WITNESS_ROUNDS)) {
      return candidate;
    }
  }
}
