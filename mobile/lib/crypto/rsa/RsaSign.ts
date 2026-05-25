/**
 * RSA-PKCS#1 v1.5 signature and verification — RFC 8017 §8.2
 *
 * Hash:  SHA-256
 * Key:   RSA-2048
 *
 * Signed string (canonical form):
 *   `${senderId}:${chatId}:${iv}:${cipherText}`
 */

import { sha256 } from "../primitives/Sha256";
import { modPow, bytesToBigInt, bigIntToBytes } from "./RsaMath";
import { parseSpkiPem, parsePkcs8Pem } from "./RsaDerParse";

// ── DigestInfo prefix ─────────────────────────────────────────────────────────

const SHA256_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x31,
  0x30, 0x0d,
  0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
  0x05, 0x00,
  0x04, 0x20,
]);

// ── PKCS#1 v1.5 pad / unpad ──────────────────────────────────────────────────

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

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function rsaSign(privateKeyPem: string, canonical: string): string {
  const { n, d } = parsePkcs8Pem(privateKeyPem);
  const k = Math.ceil(n.toString(16).length / 2);

  const hash = sha256(new TextEncoder().encode(canonical));
  const EM   = emsaPkcs1v15Encode(hash, k);

  const m = bytesToBigInt(EM);
  const s = modPow(m, d, n);
  return Array.from(bigIntToBytes(s, k))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    const m    = modPow(s, e, n);
    const EM   = bigIntToBytes(m, k);

    const hash    = sha256(new TextEncoder().encode(canonical));
    const EMexpected = emsaPkcs1v15Encode(hash, k);

    return constantTimeEqual(EM, EMexpected);
  } catch {
    return false;
  }
}
