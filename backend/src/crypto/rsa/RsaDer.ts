// DER / PEM encoding for RSA keys
// Produces output byte-identical to crypto.subtle exportKey("spki") and exportKey("pkcs8")

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
  return out;
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80)   return new Uint8Array([len]);
  if (len < 0x100)  return new Uint8Array([0x81, len]);
  return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function derInteger(value: bigint): Uint8Array {
  const hex   = value.toString(16).padStart(2, "0");
  let bytes   = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  if (bytes[0]! & 0x80) bytes = new Uint8Array([0x00, ...bytes]); // DER sign byte
  return new Uint8Array([0x02, ...encodeLength(bytes.length), ...bytes]);
}

function derSequence(contents: Uint8Array): Uint8Array {
  return new Uint8Array([0x30, ...encodeLength(contents.length), ...contents]);
}

// OID 1.2.840.113549.1.1.1 (rsaEncryption) wrapped in AlgorithmIdentifier
const RSA_OID = new Uint8Array([
  0x30, 0x0d,
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
]);

/**
 * Encode public key as SPKI DER — matches crypto.subtle exportKey("spki").
 */
export function encodeSpki(n: bigint, e: bigint): Uint8Array {
  const rsaPublicKey = derSequence(concat(derInteger(n), derInteger(e)));
  const bitString    = new Uint8Array([
    0x03, ...encodeLength(rsaPublicKey.length + 1), 0x00, ...rsaPublicKey,
  ]);
  return derSequence(concat(RSA_OID, bitString));
}

/**
 * Encode private key as PKCS#8 DER — matches crypto.subtle exportKey("pkcs8").
 */
export function encodePkcs8(
  n: bigint, e: bigint, d: bigint,
  p: bigint, q: bigint,
  dp: bigint, dq: bigint, qInv: bigint
): Uint8Array {
  const rsaPrivateKey = derSequence(concat(
    derInteger(0n),
    derInteger(n), derInteger(e), derInteger(d),
    derInteger(p), derInteger(q),
    derInteger(dp), derInteger(dq), derInteger(qInv),
  ));
  const octetString = new Uint8Array([
    0x04, ...encodeLength(rsaPrivateKey.length), ...rsaPrivateKey,
  ]);
  return derSequence(concat(derInteger(0n), RSA_OID, octetString));
}

export function bufferToPem(buffer: Uint8Array, label: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  const lines  = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}
