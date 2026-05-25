/**
 * RSA-OAEP encryption and decryption — RFC 8017 §7.1
 *
 * Hash:  SHA-256 (hLen = 32 bytes)
 * MGF:   MGF1-SHA-256 (RFC 8017 Appendix B.2.1)
 * Label: empty string (lHash = SHA-256(b""))
 * Key:   RSA-2048 (k = 256 bytes)
 *
 * Used to wrap and unwrap the per-message AES-256 key:
 *   encrypt(recipientPublicKeyPem, aesKey32)  → 256-byte ciphertext
 *   decrypt(myPrivateKeyPem, ciphertext256)   → aesKey32
 *
 * Interop test vector (Phase 7): a value encrypted with WebCrypto RSA-OAEP-SHA256
 * using the same keypair must decrypt correctly here, and vice versa.
 */

import { sha256 } from "../primitives/Sha256";
import { modPow, bytesToBigInt, bigIntToBytes } from "./RsaMath";
import { parseSpkiPem, parsePkcs8Pem } from "./RsaDerParse";

// SHA-256("") — constant label hash for empty-string OAEP label
const EMPTY_LABEL_HASH: Uint8Array = sha256(new Uint8Array(0));

// ── MGF1 (RFC 8017 Appendix B.2.1) ──────────────────────────────────────────

/**
 * Mask Generation Function 1 with SHA-256.
 * Produces a pseudorandom byte string of length maskLen from seed.
 */
function mgf1(seed: Uint8Array, maskLen: number): Uint8Array {
  const hLen = 32; // SHA-256 output length
  if (maskLen > hLen * (2 ** 32)) throw new Error("MGF1: maskLen too large");

  const blocks = Math.ceil(maskLen / hLen);
  const T = new Uint8Array(blocks * hLen);
  const counter = new Uint8Array(4);

  for (let i = 0; i < blocks; i++) {
    // I2OSP(i, 4) big-endian
    counter[0] = (i >>> 24) & 0xff;
    counter[1] = (i >>> 16) & 0xff;
    counter[2] = (i >>> 8) & 0xff;
    counter[3] = i & 0xff;

    const combined = new Uint8Array(seed.length + 4);
    combined.set(seed);
    combined.set(counter, seed.length);
    T.set(sha256(combined), i * hLen);
  }

  return T.slice(0, maskLen);
}

// ── XOR helpers ───────────────────────────────────────────────────────────────

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}

// ── OAEP encode / decode ──────────────────────────────────────────────────────

/**
 * OAEP encode — RFC 8017 §7.1.1 step 2 (EME-OAEP encoding).
 * Returns EM: a k-byte octet string ready for RSA encryption.
 */
function oaepEncode(message: Uint8Array, k: number): Uint8Array {
  const hLen = 32;
  const mLen = message.length;
  const maxMLen = k - 2 * hLen - 2;

  if (mLen > maxMLen)
    throw new Error(`OAEP: message too long (max ${maxMLen} bytes for RSA-${k * 8})`);

  // DB = lHash || PS (zeros) || 0x01 || M
  const DB = new Uint8Array(k - hLen - 1);
  DB.set(EMPTY_LABEL_HASH, 0);
  // PS is implicitly zeros (new Uint8Array is zero-filled)
  DB[k - mLen - hLen - 2] = 0x01;
  DB.set(message, k - mLen - hLen - 1);

  // Random seed
  const seed = new Uint8Array(hLen);
  globalThis.crypto.getRandomValues(seed);

  const maskedDB   = xorBytes(DB,   mgf1(seed, k - hLen - 1));
  const maskedSeed = xorBytes(seed, mgf1(maskedDB, hLen));

  // EM = 0x00 || maskedSeed || maskedDB
  const EM = new Uint8Array(k);
  EM[0] = 0x00;
  EM.set(maskedSeed, 1);
  EM.set(maskedDB, 1 + hLen);
  return EM;
}

/**
 * OAEP decode — RFC 8017 §7.1.2 step 3 (EME-OAEP decoding).
 * Returns the original message, or throws on padding error.
 */
function oaepDecode(EM: Uint8Array, k: number): Uint8Array {
  const hLen = 32;

  if (EM[0] !== 0x00) throw new Error("OAEP decryption error: leading byte not 0x00");

  const maskedSeed = EM.slice(1, 1 + hLen);
  const maskedDB   = EM.slice(1 + hLen);

  const seed = xorBytes(maskedSeed, mgf1(maskedDB, hLen));
  const DB   = xorBytes(maskedDB,   mgf1(seed, k - hLen - 1));

  // Verify lHash
  const lHash = DB.slice(0, hLen);
  let hashMatch = 0;
  for (let i = 0; i < hLen; i++) hashMatch |= (lHash[i]! ^ EMPTY_LABEL_HASH[i]!);
  if (hashMatch !== 0) throw new Error("OAEP decryption error: label hash mismatch");

  // Find 0x01 separator after PS
  let sepIdx = -1;
  for (let i = hLen; i < DB.length; i++) {
    if (DB[i] === 0x01) { sepIdx = i; break; }
    if (DB[i] !== 0x00) throw new Error("OAEP decryption error: invalid padding byte");
  }
  if (sepIdx === -1) throw new Error("OAEP decryption error: separator 0x01 not found");

  return DB.slice(sepIdx + 1);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a short message (typically a 32-byte AES key) with RSA-OAEP-SHA256.
 * @param publicKeyPem  SPKI PEM string ("-----BEGIN PUBLIC KEY-----")
 * @param message       Bytes to encrypt (max 190 bytes for RSA-2048)
 * @returns             256-byte ciphertext (same length as the RSA modulus)
 */
export function rsaOaepEncrypt(publicKeyPem: string, message: Uint8Array): Uint8Array {
  const { n, e } = parseSpkiPem(publicKeyPem);
  const k = Math.ceil(n.toString(16).length / 2); // modulus byte length

  const EM = oaepEncode(message, k);
  const m  = bytesToBigInt(EM);
  const c  = modPow(m, e, n);         // RSAEP: c = m^e mod n
  return bigIntToBytes(c, k);
}

/**
 * Decrypt RSA-OAEP-SHA256 ciphertext.
 * @param privateKeyPem PKCS#8 PEM string ("-----BEGIN PRIVATE KEY-----")
 * @param ciphertext    256-byte RSA ciphertext
 * @returns             Original plaintext bytes
 */
export function rsaOaepDecrypt(privateKeyPem: string, ciphertext: Uint8Array): Uint8Array {
  const { n, d } = parsePkcs8Pem(privateKeyPem);
  const k = Math.ceil(n.toString(16).length / 2);

  if (ciphertext.length !== k)
    throw new Error(`OAEP: ciphertext must be ${k} bytes`);

  const c  = bytesToBigInt(ciphertext);
  const m  = modPow(c, d, n);         // RSADP: m = c^d mod n
  const EM = bigIntToBytes(m, k);
  return oaepDecode(EM, k);
}
