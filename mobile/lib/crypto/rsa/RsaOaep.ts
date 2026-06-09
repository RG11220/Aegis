// RSA-OAEP-SHA256 wrap/unwrap for AES key

import { sha256 } from "../primitives/Sha256";
import { modPow, bytesToBigInt, bigIntToBytes } from "./RsaMath";
import { parseSpkiPem, parsePkcs8Pem } from "./RsaDerParse";

// SHA-256("") for empty OAEP label
const EMPTY_LABEL_HASH: Uint8Array = sha256(new Uint8Array(0));

// MGF1-SHA256

function mgf1(seed: Uint8Array, maskLen: number): Uint8Array {
  const hLen = 32;
  if (maskLen > hLen * (2 ** 32)) throw new Error("MGF1: maskLen too large");

  const blocks = Math.ceil(maskLen / hLen);
  const T = new Uint8Array(blocks * hLen);
  const counter = new Uint8Array(4);

  for (let i = 0; i < blocks; i++) {
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


function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}


function oaepEncode(message: Uint8Array, k: number): Uint8Array {
  const hLen = 32;
  const mLen = message.length;
  const maxMLen = k - 2 * hLen - 2;

  if (mLen > maxMLen)
    throw new Error(`OAEP: message too long (max ${maxMLen} bytes for RSA-${k * 8})`);

  const DB = new Uint8Array(k - hLen - 1);
  DB.set(EMPTY_LABEL_HASH, 0);
  DB[k - mLen - hLen - 2] = 0x01;
  DB.set(message, k - mLen - hLen - 1);

  const seed = new Uint8Array(hLen);
  globalThis.crypto.getRandomValues(seed);

  const maskedDB   = xorBytes(DB,   mgf1(seed, k - hLen - 1));
  const maskedSeed = xorBytes(seed, mgf1(maskedDB, hLen));

  const EM = new Uint8Array(k);
  EM[0] = 0x00;
  EM.set(maskedSeed, 1);
  EM.set(maskedDB, 1 + hLen);
  return EM;
}

function oaepDecode(EM: Uint8Array, k: number): Uint8Array {
  const hLen = 32;

  if (EM[0] !== 0x00) throw new Error("OAEP decryption error: leading byte not 0x00");

  const maskedSeed = EM.slice(1, 1 + hLen);
  const maskedDB   = EM.slice(1 + hLen);

  const seed = xorBytes(maskedSeed, mgf1(maskedDB, hLen));
  const DB   = xorBytes(maskedDB,   mgf1(seed, k - hLen - 1));

  const lHash = DB.slice(0, hLen);
  let hashMatch = 0;
  for (let i = 0; i < hLen; i++) hashMatch |= (lHash[i]! ^ EMPTY_LABEL_HASH[i]!);
  if (hashMatch !== 0) throw new Error("OAEP decryption error: label hash mismatch");

  let sepIdx = -1;
  for (let i = hLen; i < DB.length; i++) {
    if (DB[i] === 0x01) { sepIdx = i; break; }
    if (DB[i] !== 0x00) throw new Error("OAEP decryption error: invalid padding byte");
  }
  if (sepIdx === -1) throw new Error("OAEP decryption error: separator 0x01 not found");

  return DB.slice(sepIdx + 1);
}

export function rsaOaepEncrypt(publicKeyPem: string, message: Uint8Array): Uint8Array {
  const { n, e } = parseSpkiPem(publicKeyPem);
  const k = Math.ceil(n.toString(16).length / 2);

  const EM = oaepEncode(message, k);
  const m  = bytesToBigInt(EM);
  const c  = modPow(m, e, n);
  return bigIntToBytes(c, k);
}

export function rsaOaepDecrypt(privateKeyPem: string, ciphertext: Uint8Array): Uint8Array {
  const { n, d } = parsePkcs8Pem(privateKeyPem);
  const k = Math.ceil(n.toString(16).length / 2);

  if (ciphertext.length !== k)
    throw new Error(`OAEP: ciphertext must be ${k} bytes`);

  const c  = bytesToBigInt(ciphertext);
  const m  = modPow(c, d, n);
  const EM = bigIntToBytes(m, k);
  return oaepDecode(EM, k);
}
