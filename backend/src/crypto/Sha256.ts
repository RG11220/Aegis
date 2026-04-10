// SHA-256 implemented from scratch — FIPS PUB 180-4

const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [number, number, number, number, number, number, number, number] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function add(...nums: number[]): number {
  return nums.reduce((a, b) => (a + b) >>> 0, 0);
}

function preprocess(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const padLength = ((message.length + 8) & ~63) + 64 - message.length;
  const padded = new Uint8Array(message.length + padLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32), false);
  return padded;
}

export function sha256(input: Uint8Array | string): Uint8Array {
  const message = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const padded = preprocess(message);
  const view = new DataView(padded.buffer);

  // Use tuple so TypeScript knows these are always defined
  let [h0, h1, h2, h3, h4, h5, h6, h7] = H0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w: number[] = new Array(64) as number[];

    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const wi15 = w[i - 15] as number;
      const wi2  = w[i - 2]  as number;
      const wi16 = w[i - 16] as number;
      const wi7  = w[i - 7]  as number;
      const s0 = rotr(wi15, 7) ^ rotr(wi15, 18) ^ (wi15 >>> 3);
      const s1 = rotr(wi2, 17) ^ rotr(wi2, 19)  ^ (wi2 >>> 10);
      w[i] = add(wi16, s0, wi7, s1);
    }

    let a = h0, b = h1, c = h2, d = h3;
    let e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const ki = K[i] as number;
      const wi = w[i] as number;
      const S1    = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch    = (e & f) ^ (~e & g);
      const temp1 = add(h, S1, ch, ki, wi);
      const S0    = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj   = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add(S0, maj);

      h = g; g = f; f = e;
      e = add(d, temp1);
      d = c; c = b; b = a;
      a = add(temp1, temp2);
    }

    h0 = add(h0, a); h1 = add(h1, b);
    h2 = add(h2, c); h3 = add(h3, d);
    h4 = add(h4, e); h5 = add(h5, f);
    h6 = add(h6, g); h7 = add(h7, h);
  }

  const result = new Uint8Array(32);
  const out = new DataView(result.buffer);
  out.setUint32(0,  h0, false); out.setUint32(4,  h1, false);
  out.setUint32(8,  h2, false); out.setUint32(12, h3, false);
  out.setUint32(16, h4, false); out.setUint32(20, h5, false);
  out.setUint32(24, h6, false); out.setUint32(28, h7, false);
  return result;
}

export function sha256Hex(input: Uint8Array | string): string {
  return Buffer.from(sha256(input)).toString("hex");
}