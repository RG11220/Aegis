// sha256-debug-fixed.test.ts - Tests your FIXED implementation
process.stdout.write("SHA-256 tests starting...\n");

import { sha256Hex } from "./sha256";

type TestVector = { input: string; expected: string };

const vectors: TestVector[] = [
  {
    input: "",
    expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
  input: "abc",
  expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", // ✅ correct
},
  {
    input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    expected: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  },
  {
    input: "The quick brown fox jumps over the lazy dog",
    expected: "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  },
];

let passed = 0;
let failed = 0;

for (const { input, expected } of vectors) {
  const result = sha256Hex(input);
  if (result === expected) {
    console.log(`✅ PASS: sha256("${input.slice(0, 20)}${input.length > 20 ? "..." : ""}")`);
    passed++;
  } else {
    console.error(`❌ FAIL: sha256("${input.slice(0, 20)}${input.length > 20 ? "..." : ""}")`);
    console.error(`   expected: ${expected}`);
    console.error(`   got:      ${result}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);