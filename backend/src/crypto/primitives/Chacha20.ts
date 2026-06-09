// RFC 7539

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a]! + s[b]!) >>> 0; s[d] = rotl32(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) >>> 0; s[b] = rotl32(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) >>> 0; s[d] = rotl32(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) >>> 0; s[b] = rotl32(s[b]! ^ s[c]!, 7);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]!) |
    ((buf[offset + 1]! << 8)  >>> 0) |
    ((buf[offset + 2]! << 16) >>> 0) |
    ((buf[offset + 3]! << 24) >>> 0)
  ) >>> 0;
}

function chacha20Block(key: Uint8Array, counter: number, nonce: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
    readUint32LE(key, 0),  readUint32LE(key, 4),
    readUint32LE(key, 8),  readUint32LE(key, 12),
    readUint32LE(key, 16), readUint32LE(key, 20),
    readUint32LE(key, 24), readUint32LE(key, 28),
    counter >>> 0,
    readUint32LE(nonce, 0),
    readUint32LE(nonce, 4),
    readUint32LE(nonce, 8),
  ]);

  const working = new Uint32Array(state);

  for (let i = 0; i < 10; i++) {
    quarterRound(working, 0, 4, 8,  12);
    quarterRound(working, 1, 5, 9,  13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8,  13);
    quarterRound(working, 3, 4, 9,  14);
  }

  for (let i = 0; i < 16; i++) working[i] = (working[i]! + state[i]!) >>> 0;

  const output = new Uint8Array(64);
  const view = new DataView(output.buffer);
  for (let i = 0; i < 16; i++) view.setUint32(i * 4, working[i]!, true);
  return output;
}

export function chacha20(
  key: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
  counter = 1
): Uint8Array {
  if (key.length !== 32)  throw new Error("ChaCha20 key must be 32 bytes");
  if (nonce.length !== 12) throw new Error("ChaCha20 nonce must be 12 bytes");
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffffffff)
    throw new Error("ChaCha20 counter must be a 32-bit unsigned integer");

  const blocksNeeded = Math.ceil(data.length / 64);
  if (counter + blocksNeeded > 0x1_0000_0000)
    throw new Error("ChaCha20 counter overflow");

  const output = new Uint8Array(data.length);
  let blockCounter = counter;

  for (let offset = 0; offset < data.length; offset += 64) {
    const keystream = chacha20Block(key, blockCounter++, nonce);
    const chunkSize = Math.min(64, data.length - offset);
    for (let i = 0; i < chunkSize; i++)
      output[offset + i] = (data[offset + i]!) ^ (keystream[i]!);
  }

  return output;
}
