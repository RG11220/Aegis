import { pbkdf2 }     from "../primitives/Pbkdf2";
import { chacha20 }   from "../primitives/Chacha20";
import { hmacSha256 } from "../primitives/Hmac";
import { webcrypto }  from "crypto";

const ITERATIONS = 310_000;

function getRandomBytes(length: number): Uint8Array {
  return (webcrypto as unknown as Crypto).getRandomValues(new Uint8Array(length));
}

// constant-time compare
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
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
    encryptedPrivateKey: `${Buffer.from(nonce).toString("hex")}:${Buffer.from(ciphertext).toString("hex")}:${Buffer.from(mac).toString("hex")}`,
    keySalt: Buffer.from(salt).toString("hex"),
  };
}

export function decryptPrivateKey(
  encryptedPrivateKey: string,
  keySalt: string,
  password: string
): string {
  const salt  = Buffer.from(keySalt, "hex");
  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) throw new Error("decryptPrivateKey: invalid format (expected nonce:ciphertext:mac)");

  const [nonceHex, ciphertextHex, macHex] = parts as [string, string, string];
  const nonce      = Buffer.from(nonceHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const storedMac  = Buffer.from(macHex, "hex");

  const material = pbkdf2(password, salt, ITERATIONS, 64);
  const encKey   = material.slice(0, 32);
  const macKey   = material.slice(32, 64);

  // mac before decrypt
  const macInput = new Uint8Array(nonce.length + ciphertext.length);
  macInput.set(nonce);
  macInput.set(ciphertext, nonce.length);
  const expectedMac = hmacSha256(macKey, macInput);
  if (!constantTimeEqual(storedMac, Buffer.from(expectedMac))) {
    throw new Error("decryptPrivateKey: MAC verification failed — wrong password or corrupted data");
  }

  const plaintext = chacha20(encKey, nonce, ciphertext);
  const pem = new TextDecoder().decode(plaintext);

  if (!pem.startsWith("-----BEGIN")) {
    throw new Error("decryptPrivateKey: decrypted output is not a valid PEM key");
  }

  return pem;
}
