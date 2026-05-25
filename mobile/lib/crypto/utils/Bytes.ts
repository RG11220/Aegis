/**
 * Pure-JS base64 and hex encode/decode helpers.
 *
 * These replace Node's `Buffer.from(x, "base64")` / `Buffer.from(x).toString("base64")`
 * and the hex equivalents so the crypto layer runs in React Native / Hermes
 * without any Node built-ins.
 *
 * All functions are synchronous, allocation-minimal, and produce the same
 * output as their Buffer equivalents.
 */

// ── Hex ───────────────────────────────────────────────────────────────────────

const HEX_CHARS = "0123456789abcdef";

/** Encode a Uint8Array to a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX_CHARS[b >>> 4] + HEX_CHARS[b & 0x0f];
  }
  return out;
}

/** Decode a hex string (even length, lowercase or uppercase) to Uint8Array. */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hexToBytes: odd-length hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
      throw new Error(`hexToBytes: invalid hex pair "${pair}" at index ${i}`);
    }
    out[i] = parseInt(pair, 16);
  }
  return out;
}

// ── Base64 ────────────────────────────────────────────────────────────────────

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode a Uint8Array to standard Base64 (with `=` padding). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;

    out += B64_CHARS[b0 >>> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >>> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >>> 6)] : "=";
    out += i + 2 < len ? B64_CHARS[b2 & 0x3f] : "=";
  }

  return out;
}

/** Build the Base64 decode lookup table (value 255 = invalid). */
const B64_LOOKUP: Uint8Array = (() => {
  const t = new Uint8Array(256).fill(255);
  for (let i = 0; i < 64; i++) t[B64_CHARS.charCodeAt(i)] = i;
  t["=".charCodeAt(0)] = 0; // treat padding as 0 during decode
  return t;
})();

/**
 * Decode a standard Base64 string (with or without `=` padding) to Uint8Array.
 * Tolerates whitespace (newlines in PEM blocks).
 */
export function base64ToBytes(b64: string): Uint8Array {
  // Strip whitespace (handles PEM line-breaks)
  const clean = b64.replace(/\s/g, "");
  const padded = clean.length % 4 === 0 ? clean : clean + "=".repeat(4 - (clean.length % 4));

  const outLen = (padded.length / 4) * 3
    - (padded.endsWith("==") ? 2 : padded.endsWith("=") ? 1 : 0);

  const out = new Uint8Array(outLen);
  let outIdx = 0;

  for (let i = 0; i < padded.length; i += 4) {
    const v0 = B64_LOOKUP[padded.charCodeAt(i)]!;
    const v1 = B64_LOOKUP[padded.charCodeAt(i + 1)]!;
    const v2 = B64_LOOKUP[padded.charCodeAt(i + 2)]!;
    const v3 = B64_LOOKUP[padded.charCodeAt(i + 3)]!;

    if (v0 === 255 || v1 === 255 || v2 === 255 || v3 === 255)
      throw new Error("base64ToBytes: invalid character in input");

    const word = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    if (outIdx < outLen) out[outIdx++] = (word >>> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (word >>> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = word & 0xff;
  }

  return out;
}
