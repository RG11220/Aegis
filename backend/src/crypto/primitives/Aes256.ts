/**
 * AES-256 in CTR mode — implemented from scratch.
 *
 * Block cipher: NIST FIPS-197 (AES)
 * Mode:         NIST SP 800-38A Section 6.5 (CTR)
 *
 * Test vectors used for verification (see Phase 7 test suite):
 *   FIPS-197 Appendix B  — single AES-256 block encrypt
 *   SP 800-38A Appendix F.5 — AES-256-CTR encrypt/decrypt
 *
 * Internals:
 *   Key schedule  — 15 round keys (Nr=14 rounds, Nk=8 words) per FIPS-197 §5.2
 *   SubBytes      — S-box computed once via GF(2^8) multiplicative inverse + affine map
 *   ShiftRows     — row-wise left rotation per FIPS-197 §5.1.2
 *   MixColumns    — GF(2^8) polynomial multiplication per FIPS-197 §5.1.3
 *   AddRoundKey   — XOR with round key
 *   CTR keystream — AES(key, counter++) XOR plaintext; counter is big-endian 128-bit
 *
 * Public API:
 *   aesEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array
 *   aesDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array
 *   (CTR mode is symmetric — encrypt and decrypt are the same operation)
 */

// ── GF(2^8) arithmetic ───────────────────────────────────────────────────────

/**
 * Multiply two bytes in GF(2^8) with the AES irreducible polynomial
 * x^8 + x^4 + x^3 + x + 1 (0x11b). Used for S-box construction and MixColumns.
 */
function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hiBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (hiBit) a ^= 0x1b; // reduce mod 0x11b
    b >>= 1;
  }
  return p;
}

/**
 * Compute the multiplicative inverse of x in GF(2^8).
 * 0 maps to 0 by convention (FIPS-197 §5.1.1).
 */
function gfInverse(x: number): number {
  if (x === 0) return 0;
  // Exhaustive search is fast for a 256-element field.
  for (let i = 1; i < 256; i++) {
    if (gmul(x, i) === 1) return i;
  }
  return 0; // unreachable
}

// ── S-box and inverse S-box ──────────────────────────────────────────────────

/**
 * AES S-box: GF(2^8) inverse followed by the affine transformation
 * defined in FIPS-197 §5.1.1 Figure 7.
 */
function buildSbox(): Uint8Array {
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const inv = gfInverse(i);
    // Affine transform: s = inv XOR rotate(inv,1) XOR rotate(inv,2)
    //                       XOR rotate(inv,3) XOR rotate(inv,4) XOR 0x63
    const s =
      inv ^
      ((inv << 1) | (inv >> 7)) ^
      ((inv << 2) | (inv >> 6)) ^
      ((inv << 3) | (inv >> 5)) ^
      ((inv << 4) | (inv >> 4)) ^
      0x63;
    sbox[i] = s & 0xff;
  }
  return sbox;
}

/**
 * AES inverse S-box: inverse affine transform followed by GF(2^8) inverse.
 * Used in the decryption path (not needed for CTR mode — kept for completeness).
 */
function buildInvSbox(sbox: Uint8Array): Uint8Array {
  const inv = new Uint8Array(256);
  for (let i = 0; i < 256; i++) inv[sbox[i] as number] = i;
  return inv;
}

const SBOX = buildSbox();
const _INV_SBOX = buildInvSbox(SBOX); // available for ECB/CBC decrypt if needed later

// ── Round constants (Rcon) ───────────────────────────────────────────────────

/**
 * Round constants for key expansion — powers of x in GF(2^8).
 * Rcon[i] = [x^(i-1), 0, 0, 0] per FIPS-197 §5.2.
 * We store only the first byte; the three 0x00 bytes are implicit.
 */
const RCON = new Uint8Array(11);
RCON[1] = 1;
for (let i = 2; i <= 10; i++) RCON[i] = gmul(RCON[i - 1] as number, 2);

// ── Key expansion ────────────────────────────────────────────────────────────

/**
 * Expand a 32-byte (256-bit) key into 15 round keys (60 words / 240 bytes).
 * AES-256: Nk=8, Nr=14, so we need Nr+1=15 round keys per FIPS-197 §5.2.
 */
function expandKey(key: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("AES-256 requires a 32-byte key");

  const Nk = 8;   // key length in 32-bit words
  const Nr = 14;  // number of rounds
  const words = (Nr + 1) * 4; // 60 words total

  const w = new Uint8Array(words * 4); // flat byte array
  w.set(key, 0); // first Nk words = key itself

  for (let i = Nk; i < words; i++) {
    const base = (i - 1) * 4;
    let [b0, b1, b2, b3] = [w[base]!, w[base + 1]!, w[base + 2]!, w[base + 3]!];

    if (i % Nk === 0) {
      // RotWord: [b0,b1,b2,b3] → [b1,b2,b3,b0]
      const tmp = b0; b0 = b1; b1 = b2; b2 = b3; b3 = tmp;
      // SubWord
      b0 = SBOX[b0]!; b1 = SBOX[b1]!; b2 = SBOX[b2]!; b3 = SBOX[b3]!;
      // XOR with Rcon
      b0 ^= RCON[i / Nk]!;
    } else if (i % Nk === 4) {
      // Extra SubWord for AES-256 (not present in AES-128/192)
      b0 = SBOX[b0]!; b1 = SBOX[b1]!; b2 = SBOX[b2]!; b3 = SBOX[b3]!;
    }

    const prev = (i - Nk) * 4;
    const cur = i * 4;
    w[cur]     = w[prev]!     ^ b0;
    w[cur + 1] = w[prev + 1]! ^ b1;
    w[cur + 2] = w[prev + 2]! ^ b2;
    w[cur + 3] = w[prev + 3]! ^ b3;
  }

  return w;
}

// ── AES state helpers ────────────────────────────────────────────────────────

/** Copy 16 bytes into a 4×4 column-major state matrix. */
function bytesToState(block: Uint8Array, offset = 0): number[][] {
  return [
    [block[offset]!,     block[offset + 4]!, block[offset + 8]!,  block[offset + 12]!],
    [block[offset + 1]!, block[offset + 5]!, block[offset + 9]!,  block[offset + 13]!],
    [block[offset + 2]!, block[offset + 6]!, block[offset + 10]!, block[offset + 14]!],
    [block[offset + 3]!, block[offset + 7]!, block[offset + 11]!, block[offset + 15]!],
  ];
}

/** Write state matrix back to 16 bytes (column-major). */
function stateToBytes(state: number[][]): Uint8Array {
  const out = new Uint8Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = state[row]![col]!;
    }
  }
  return out;
}

// ── AES round transforms ─────────────────────────────────────────────────────

/** SubBytes — replace each state byte with its S-box value (FIPS-197 §5.1.1). */
function subBytes(state: number[][]): void {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      state[r]![c] = SBOX[state[r]![c]!]!;
}

/**
 * ShiftRows — cyclically shift row r left by r positions (FIPS-197 §5.1.2).
 * Row 0: no shift. Row 1: shift 1. Row 2: shift 2. Row 3: shift 3.
 */
function shiftRows(state: number[][]): void {
  for (let r = 1; r < 4; r++) {
    const row = state[r]!;
    for (let s = 0; s < r; s++) {
      const tmp = row[0]!;
      row[0] = row[1]!; row[1] = row[2]!; row[2] = row[3]!; row[3] = tmp;
    }
  }
}

/**
 * MixColumns — multiply each column by the AES MDS matrix in GF(2^8)
 * (FIPS-197 §5.1.3). Each column [s0,s1,s2,s3] becomes:
 *   [2*s0 ^ 3*s1 ^ s2 ^ s3,
 *    s0 ^ 2*s1 ^ 3*s2 ^ s3,
 *    s0 ^ s1 ^ 2*s2 ^ 3*s3,
 *    3*s0 ^ s1 ^ s2 ^ 2*s3]
 */
function mixColumns(state: number[][]): void {
  for (let c = 0; c < 4; c++) {
    const s0 = state[0]![c]!;
    const s1 = state[1]![c]!;
    const s2 = state[2]![c]!;
    const s3 = state[3]![c]!;
    state[0]![c] = gmul(s0, 2) ^ gmul(s1, 3) ^ s2 ^ s3;
    state[1]![c] = s0 ^ gmul(s1, 2) ^ gmul(s2, 3) ^ s3;
    state[2]![c] = s0 ^ s1 ^ gmul(s2, 2) ^ gmul(s3, 3);
    state[3]![c] = gmul(s0, 3) ^ s1 ^ s2 ^ gmul(s3, 2);
  }
}

/** AddRoundKey — XOR state with the round key slice (FIPS-197 §5.1.4). */
function addRoundKey(state: number[][], roundKey: Uint8Array, roundOffset: number): void {
  const keyBlock = roundKey.slice(roundOffset * 16, (roundOffset + 1) * 16);
  const rk = bytesToState(keyBlock);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      state[r]![c]! ^= rk[r]![c]!;
}

// ── AES-256 block encrypt ────────────────────────────────────────────────────

/**
 * Encrypt a single 16-byte block using the pre-expanded round keys.
 * AES-256: Nr=14 rounds (FIPS-197 §5.1).
 */
function aesEncryptBlock(block: Uint8Array, expandedKey: Uint8Array): Uint8Array {
  const state = bytesToState(block);
  const Nr = 14;

  addRoundKey(state, expandedKey, 0);

  for (let round = 1; round < Nr; round++) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, expandedKey, round);
  }

  // Final round — no MixColumns
  subBytes(state);
  shiftRows(state);
  addRoundKey(state, expandedKey, Nr);

  return stateToBytes(state);
}

// ── CTR mode ─────────────────────────────────────────────────────────────────

/**
 * Increment a 16-byte big-endian counter by 1 (in-place).
 * Wraps around on overflow (standard CTR behavior).
 */
function incrementCounter(counter: Uint8Array): void {
  for (let i = 15; i >= 0; i--) {
    if ((++counter[i]! & 0xff) !== 0) break;
    counter[i] = counter[i]! & 0xff;
  }
}

/**
 * AES-256-CTR encryption (and decryption — CTR is symmetric).
 *
 * key:  32-byte AES-256 key
 * iv:   16-byte initial counter value (random per message; transmitted with ciphertext)
 * data: plaintext (encrypt) or ciphertext (decrypt)
 *
 * Returns the result as a new Uint8Array of the same length as data.
 */
function aesCtr(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("AES-256 requires a 32-byte key");
  if (iv.length !== 16)  throw new Error("AES-256-CTR requires a 16-byte IV");

  const expandedKey = expandKey(key);
  const output = new Uint8Array(data.length);
  const counter = new Uint8Array(iv); // copy so we don't mutate the caller's IV

  for (let offset = 0; offset < data.length; offset += 16) {
    const keystream = aesEncryptBlock(counter, expandedKey);
    const blockLen = Math.min(16, data.length - offset);
    for (let i = 0; i < blockLen; i++) {
      output[offset + i] = data[offset + i]! ^ keystream[i]!;
    }
    incrementCounter(counter);
  }

  return output;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt plaintext with AES-256-CTR.
 * @param key       32-byte secret key
 * @param iv        16-byte random IV (store alongside ciphertext; never reuse with the same key)
 * @param plaintext Arbitrary-length plaintext bytes
 * @returns         Ciphertext of the same length
 */
export function aesEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return aesCtr(key, iv, plaintext);
}

/**
 * Decrypt ciphertext with AES-256-CTR.
 * @param key        32-byte secret key
 * @param iv         16-byte IV used during encryption
 * @param ciphertext Ciphertext bytes
 * @returns          Plaintext of the same length
 */
export function aesDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return aesCtr(key, iv, ciphertext); // CTR decrypt = CTR encrypt
}

/** Convert a hex string to Uint8Array (helper for tests and interop). */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Hex string must have even length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert a Uint8Array to a lowercase hex string (helper for tests and interop). */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
