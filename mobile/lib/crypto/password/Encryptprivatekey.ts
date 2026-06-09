// encrypt private key: PBKDF2 + ChaCha20, HMAC-SHA256 MAC

import { pbkdf2 }     from "../primitives/Pbkdf2";
import { chacha20 }   from "../primitives/Chacha20";
import { hmacSha256 } from "../primitives/Hmac";
import { bytesToHex, hexToBytes } from "../utils/Bytes";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function deriveKeyAsync(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLength: number
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const key = await subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt.slice(0), // must be plain ArrayBuffer not SharedArrayBuffer
        iterations,
      },
      key,
      keyLength * 8
    );

    return new Uint8Array(derivedBits);
  }

  return pbkdf2(password, salt, iterations, keyLength);
}

// pbkdf2 64 bytes: [0-31]=enc key, [32-63]=mac key; format: nonce:ct:mac
export function encryptPrivateKey(
  privateKeyPem: string,
  password: string
): { encryptedPrivateKey: string; keySalt: string } {
  const salt  = getRandomBytes(16);
  const nonce = getRandomBytes(12);

  const material = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  const ciphertext = chacha20(encKey, nonce, new TextEncoder().encode(privateKeyPem));

  // mac covers nonce || ciphertext
  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const mac = hmacSha256(macKey, macInput);

  return {
    encryptedPrivateKey: `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}:${bytesToHex(mac)}`,
    keySalt: bytesToHex(salt),
  };
}

// verify mac then decrypt; throws on wrong password or bad data
export function decryptPrivateKey(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): string {
  const salt  = hexToBytes(keySalt);
  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) throw new Error("decryptPrivateKey: invalid format (expected nonce:ciphertext:mac)");

  const [nonceHex, ciphertextHex, macHex] = parts as [string, string, string];
  const nonce      = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const storedMac  = hexToBytes(macHex);

  const material = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  // verify mac first
  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);
  if (!constantTimeEqual(storedMac, expectedMac)) {
    throw new Error("decryptPrivateKey: MAC verification failed — wrong password or corrupted data");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  const pem = new TextDecoder().decode(plaintext);

  // sanity check pem header
  if (!pem.startsWith("-----BEGIN")) {
    throw new Error("decryptPrivateKey: decrypted output is not a valid PEM key");
  }

  return pem;
}

export async function decryptPrivateKeyAsync(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): Promise<string> {
  const salt  = hexToBytes(keySalt);
  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) throw new Error("decryptPrivateKeyAsync: invalid format (expected nonce:ciphertext:mac)");

  const [nonceHex, ciphertextHex, macHex] = parts as [string, string, string];
  const nonce      = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const storedMac  = hexToBytes(macHex);

  const material = await deriveKeyAsync(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);
  if (!constantTimeEqual(storedMac, expectedMac)) {
    throw new Error("decryptPrivateKeyAsync: MAC verification failed — wrong password or corrupted data");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  const pem = new TextDecoder().decode(plaintext);

  // sanity check pem header
  if (!pem.startsWith("-----BEGIN")) {
    throw new Error("decryptPrivateKeyAsync: decrypted output is not a valid PEM key");
  }

  return pem;
}
