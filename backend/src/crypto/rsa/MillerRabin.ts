import { modPow, bytesToBigInt } from "./RsaMath";
import type { SeededRng }        from "../seed/SeededRng";

// no false positives for n < 2^82
const DETERMINISTIC_WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  // n-1 = 2^r * d
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
    return false;
  }

  return true;
}

const RANDOM_WITNESS_ROUNDS = 40;

function isProbablePrime(n: bigint, rng: SeededRng, rounds: number): boolean {
  if (n < 4n) return true;

  // n-1 = 2^r * d
  let r = 0n, d = n - 1n;
  while (d % 2n === 0n) { d /= 2n; r++; }

  const nMinus1 = n - 1n;
  const nBytes = Math.ceil(n.toString(16).length / 2);

  for (let i = 0; i < rounds; i++) {
    const aBytes = rng.nextBytes(nBytes);
    let a = bytesToBigInt(aBytes) % (nMinus1 - 2n) + 2n;
    if (a < 2n) a = 2n;

    let x = modPow(a, d, n);
    if (x === 1n || x === nMinus1) continue;

    let probably = false;
    for (let j = 0n; j < r - 1n; j++) {
      x = (x * x) % n;
      if (x === nMinus1) { probably = true; break; }
    }
    if (!probably) return false;
  }

  return true;
}

// 40 rounds, error < 2^{-80}
export function generatePrime(rng: SeededRng): bigint {
  while (true) {
    const bytes = rng.nextBytes(128); // 1024 bits
    bytes[0]!   |= 0xc0; // top 2 bits set → full-size
    bytes[127]! |= 0x01; // odd

    const candidate = bytesToBigInt(bytes);
    if (isPrime(candidate) && isProbablePrime(candidate, rng, RANDOM_WITNESS_ROUNDS)) {
      return candidate;
    }
  }
}
