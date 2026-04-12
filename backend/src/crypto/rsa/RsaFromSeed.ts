// Deterministic RSA-2048 key generation from a mnemonic seed phrase
// Same 24 words → always identical keys. Different words → unique keys.
//
// Chain:
//   24 words → numeric seed string (SeedDictionary)
//       → PBKDF2 key + nonce (SeedToKeyMaterial)
//       → ChaCha20 keystream PRNG (SeededRng)
//       → Miller-Rabin prime generation (MillerRabin)
//       → RSA key math → PKCS#8 / SPKI PEM (RsaDer)

import { seedStringFromWords } from "../seed/SeedDictionary";
import { keyMaterialFromSeed } from "../seed/SeedToKeyMaterial";
import { makeSeededRng }       from "../seed/SeededRng";
import { generatePrime }       from "./MillerRabin";
import { modInverse, gcd }     from "./RsaMath";
import { encodeSpki, encodePkcs8, bufferToPem } from "./RsaDer";

export { generateSeedPhrase, seedStringFromWords } from "../seed/SeedDictionary";

const E = 65537n;

export async function generateRSAKeyPairFromSeed(words: string[]): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}> {
  const seedString = seedStringFromWords(words);
  const { key, nonce } = keyMaterialFromSeed(seedString);
  const rng = makeSeededRng(key, nonce);

  let p: bigint, q: bigint, d: bigint;

  while (true) {
    p = generatePrime(rng);
    q = generatePrime(rng);
    if (p === q) continue;

    const n = p * q;
    if (n >> 2047n === 0n) continue; // must be a full 2048-bit modulus

    // λ(n) = lcm(p−1, q−1)
    const p1     = p - 1n;
    const q1     = q - 1n;
    const lambda = (p1 / gcd(p1, q1)) * q1;

    if (lambda % E === 0n) continue; // e must be coprime with λ(n)

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
