/**
 * RSA-PKCS#1 v1.5 signature and verification — RFC 8017 §8.2
 *
 * Hash:  SHA-256
 * Key:   RSA-2048
 *
 * Used to sign the canonical encrypted message package so the recipient can
 * verify sender identity and ciphertext integrity before decrypting.
 *
 * Signed string (canonical form):
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 * — all fields hex/string, colon-delimited, no extra whitespace.
 *
 * Interop note (Phase 7): verify that a signature produced here passes
 * WebCrypto RSASSA-PKCS1-v1_5 verify with the same key, and vice versa.
 */

import { sha256 } from "../primitives/Sha256";
import { modPow, bytesToBigInt, bigIntToBytes } from "./RsaMath";
import { parseSpkiPem, parsePkcs8Pem } from "./RsaDerParse";

// ── DigestInfo prefix ─────────────────────────────────────────────────────────

/**
 * DER DigestInfo prefix for SHA-256 — RFC 8017 Appendix C / RFC 3447.
 * Full structure:
 *   30 31                  SEQUENCE (49 bytes)
 *     30 0d                  SEQUENCE (13 bytes) — AlgorithmIdentifier
 *       06 09 60 86 48 01 65 03 04 02 01   OID SHA-256 (2.16.840.1.101.3.4.2.1)
 *       05 00                              NULL
 *     04 20                BIT STRING (32 bytes) — the hash follows
 */
const SHA256_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x31,
  0x30, 0x0d,
  0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
  0x05, 0x00,
  0x04, 0x20,
]);

// ── PKCS#1 v1.5 pad / unpad ──────────────────────────────────────────────────

/**
 * Build the EMSA-PKCS1-v1_5 encoded message — RFC 8017 §9.2.
 * EM = 0x00 || 0x01 || PS || 0x00 || DigestInfo
 * PS = 0xFF bytes, length = k - len(DigestInfo) - 3
 */
function emsaPkcs1v15Encode(messageHash: Uint8Array, k: number): Uint8Array {
  const T = new Uint8Array(SHA256_DIGEST_INFO_PREFIX.length + 32);
  T.set(SHA256_DIGEST_INFO_PREFIX);
  T.set(messageHash, SHA256_DIGEST_INFO_PREFIX.length);

  const psLen = k - T.length - 3;
  if (psLen < 8) throw new Error("PKCS1v15: key too short for this hash");

  const EM = new Uint8Array(k);
  EM[0] = 0x00;
  EM[1] = 0x01;
  EM.fill(0xff, 2, 2 + psLen);
  EM[2 + psLen] = 0x00;
  EM.set(T, 3 + psLen);
  return EM;
}

/**
 * Constant-time byte comparison — prevents timing attacks on signature verify.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sign a canonical message string with the sender's RSA private key.
 *
 * @param privateKeyPem  PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----")
 * @param canonical      The string to sign: `${senderId}:${chatId}:${iv}:${cipherText}`
 * @returns              Hex-encoded RSA signature (512 hex chars for RSA-2048)
 */
export function rsaSign(privateKeyPem: string, canonical: string): string {
  const { n, d } = parsePkcs8Pem(privateKeyPem);
  const k = Math.ceil(n.toString(16).length / 2);

  const hash = sha256(new TextEncoder().encode(canonical));
  const EM   = emsaPkcs1v15Encode(hash, k);

  const m = bytesToBigInt(EM);
  const s = modPow(m, d, n); // RSASP1: s = m^d mod n
  return Array.from(bigIntToBytes(s, k))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify an RSA-PKCS#1 v1.5 signature.
 *
 * @param publicKeyPem  SPKI PEM ("-----BEGIN PUBLIC KEY-----")
 * @param canonical     The same canonical string that was signed
 * @param signatureHex  Hex-encoded signature returned by rsaSign
 * @returns             true if valid, false otherwise (never throws on bad sig)
 */
export function rsaVerify(
  publicKeyPem: string,
  canonical: string,
  signatureHex: string
): boolean {
  try {
    const { n, e } = parseSpkiPem(publicKeyPem);
    const k = Math.ceil(n.toString(16).length / 2);

    const sigBytes = Uint8Array.from(
      signatureHex.match(/../g)!.map((h) => parseInt(h, 16))
    );
    if (sigBytes.length !== k) return false;

    const s    = bytesToBigInt(sigBytes);
    const m    = modPow(s, e, n); // RSAVP1: m = s^e mod n
    const EM   = bigIntToBytes(m, k);

    const hash    = sha256(new TextEncoder().encode(canonical));
    const EMexpected = emsaPkcs1v15Encode(hash, k);

    return constantTimeEqual(EM, EMexpected);
  } catch {
    return false;
  }
}
