# Aegis — E2E Encryption Roadmap & Task Plan

> Hand-off document for an implementation agent (Sonnet). It describes the goal, the
> **current state of the code**, the decisions that must be made before coding, and a
> **phased, checkable task list** with file paths and acceptance criteria.
>
> Read the whole "Context" and "Decisions" sections before writing any code. Do not
> skip the testing requirements — this is cryptography, and silent correctness bugs are
> the main risk.

---

## 1. Context — what Aegis is

Aegis is a Trustless, end-to-end-encrypted chat app (final project). The server should be a
"blind relay": it stores and forwards ciphertext but cannot read message contents.

**Actual stack in this repo** (note: differs slightly from the written proposal):

- **Backend** — `backend/`: Node + Express + TypeScript, `mysql2` (identity), Mongoose/MongoDB
  (messages), `socket.io` (realtime), Clerk (current auth). A `bun.lock` is present; the proposal
  says Bun runtime — either works, code is standard TS.
- **Mobile client** — `mobile/`: Expo / React Native, expo-router, Clerk, TanStack Query,
  Zustand socket store. (The proposal mentions React/Angular web + WebRTC; the real client is
  React Native. Plan for RN.)
- **Crypto** — `backend/src/crypto/`: a large, **already-working** from-scratch crypto library
  (details below).

### Target end-to-end flow (per proposal + requested features)

1. **Sign up** → derive a deterministic RSA-2048 keypair from a recovery-word **seed**; email the
   recovery words to the user; store in MySQL: hashed password, public key, **encrypted** private
   key, key salt, `isVerified`, `createdAt`.
2. **Send message** → generate a random AES key → AES-encrypt the plaintext → RSA-encrypt the AES
   key with the **recipient's public key** → **sign** the package → store/relay only ciphertext.
3. **Receive message** → client verifies signature → RSA-decrypts the AES key with its private key
   → AES-decrypts → shows **plaintext** (decryption happens client-side, before render).
4. **Forgot password** → user types recovery words → client **re-derives the same RSA private key
   from the seed** → sets a new password → re-encrypts the private key under the new password →
   server stores the new blob → email verification gates the change. Old messages stay readable
   because the recovered private key is identical.

---

## 2. Current state — audited file by file

### Already implemented and looks correct (`backend/src/crypto/`)

| Module | File | Status |
|---|---|---|
| SHA-256 (FIPS 180-4) | `primitives/Sha256.ts` | Complete (`sha256`, `sha256Hex`) |
| HMAC-SHA256 (RFC 2104) | `primitives/Hmac.ts` | Complete |
| PBKDF2-HMAC-SHA256 (RFC 2898) | `primitives/Pbkdf2.ts` | Works; **messy formatting**, clean up |
| ChaCha20 (RFC 7539) | `primitives/Chacha20.ts` | Complete |
| Seed dictionary | `seed/SeedDictionary.ts` | Complete — **uses 24 words, not 14** |
| Seeded RNG (ChaCha20 keystream) | `seed/SeededRng.ts` | Complete |
| Seed → key material (PBKDF2) | `seed/SeedToKeyMaterial.ts` | Complete |
| RSA big-int math | `rsa/RsaMath.ts` | Complete (`modPow`, `modInverse`, `gcd`) |
| Miller-Rabin + prime gen | `rsa/MillerRabin.ts` | Works; **witness-set claim is wrong for 1024-bit** |
| DER/PEM (SPKI + PKCS#8) | `rsa/RsaDer.ts` | Complete |
| Deterministic RSA from seed | `rsa/RsaFromSeed.ts` | Complete (`generateRSAKeyPairFromSeed`) |
| Random RSA keygen | `rsa/RsaKeygen.ts` | Complete (uses WebCrypto) |
| Password hashing | `password/Hashpassword.ts` | Complete (`hashPassword`, `verifyPassword`, constant-time) |
| Private-key encryption | `password/Encryptprivatekey.ts` | Complete (`encryptPrivateKey`/`decryptPrivateKey`, PBKDF2 + ChaCha20) |

### Partially scaffolded

- `backend/src/queries/userQueries` — has `createEncryptedUser`, `getUserByEmail`, and a `UserRow`
  type with the target columns (`userPassword`, `publicKey`, `privateKey`, `keySalt`, `isVerified`,
  `createdAt`). **BUG: this file has no `.ts` extension**, so it is not importable and is effectively
  dead. Also the `INSERT` does not set `isVerified`/`createdAt`/`profilePicture`.

### Missing entirely (the real work)

- **AES-256** (the proposal's headline algorithm) — only ChaCha20 exists.
- **RSA encrypt/decrypt with padding (OAEP)** — `modPow` is raw textbook RSA; there is no padded
  encrypt/decrypt for wrapping the AES key.
- **Digital signature + verification** — no sign/verify module.
- **Message orchestration** — no "encrypt-then-wrap-then-sign" / "verify-then-unwrap-then-decrypt".
- **Client-side crypto in the mobile app** — `mobile/` has zero crypto; it currently sends/stores
  plaintext `text`.
- **DB schema migration** — the live `Users` table has `userID, userName, userEmail, profilePicture,
  clerkId`; it lacks `userPassword, publicKey, privateKey, keySalt, isVerified, createdAt`. Mongo
  `Message` stores plaintext `text`, not ciphertext.
- **Email delivery** (recovery words + 2FA codes) and the **forgot-password / seed-recovery** flow.

---

## 3. Decisions required BEFORE coding

These shape everything. Pick an answer for each (recommendations given). Record the choices at the
top of the first PR.

1. **AES-256 vs ChaCha20 for message content.**
   The proposal's graded "algorithmic problem" is literally implementing AES-256 (SubBytes,
   ShiftRows, MixColumns, AddRoundKey, key expansion). The code shipped ChaCha20 instead.
   **Recommendation:** implement AES-256 from scratch and use it for message content (to satisfy the
   spec). Keep ChaCha20 only where it already works (private-key-at-rest) or switch that to AES too
   for consistency. Decide and be consistent.

2. **14 vs 24 recovery words.**
   Proposal says 14; `SeedDictionary.ts` enforces 24. **Recommendation:** keep 24 (stronger entropy)
   and update the proposal text, OR change the code to 14 if the written spec is fixed for grading.
   Either way, make code and proposal agree.

3. **Auth: keep Clerk, go custom, or hybrid.**
   The proposal describes self-implemented password hashing + JWT + 2FA in *your* DB; the requested
   feature #2 says "add the password to the DB (it's only in Clerk now)." Clerk currently owns login
   (incl. the Google OAuth you just wired up). **Recommendation (pragmatic):** *hybrid* — keep Clerk
   for primary login/identity, but add the crypto "password" as a **separate encryption passphrase**
   that protects the private key, plus your own `isVerified` + email codes. This avoids a risky full
   auth migration while still satisfying "password hashed in our DB" and the forgot-flow.
   **Alternative (spec-pure):** replace Clerk with custom email+password+JWT+2FA. Larger and riskier;
   only do this if the grade requires no third-party auth.

4. **Where crypto runs (the Trustless question).**
   "Blind server" requires encryption/decryption on the **client**. **Recommendation (MVP):**
   - Keypair generation at sign-up: **server-side** (seed generated, keys derived, private key
     encrypted, words emailed). Pragmatic because pure-JS RSA keygen is very slow on a phone.
   - Message encrypt/decrypt and signature verify: **client-side** in the mobile app, using the
     private key the client unlocks locally with the password. This honors "client decrypts before
     showing."
   - **Document the trade-off honestly:** because the server briefly sees the private key at sign-up
     and stores it (encrypted), this is "encrypted-at-rest key escrow," not maximal zero-knowledge.
     PBKDF2 (310k) makes offline attack hard. Note this in the report.

5. **AES mode + integrity.**
   Raw AES-CBC/CTR is malleable. **Recommendation:** AES-256 in **CTR or CBC**, and rely on the
   **per-message RSA signature** for integrity/authenticity (matches the proposal's "sign the
   package"). Optionally implement AES-GCM later for built-in auth (more work: GHASH).

6. **Group chat / WebRTC video (proposal full-mesh).**
   **Recommendation:** out of scope for this roadmap's core; treat as a later phase. This plan targets
   1:1 encrypted text. Add a stub phase at the end.

---

## 4. Cross-cutting rules for the implementer (Sonnet)

- **Never use raw RSA** (`modPow` alone) to encrypt or sign. Always add padding (OAEP for
  encryption, PSS or PKCS#1 v1.5 for signatures).
- **Determinism is sacred.** The seed→keys chain must produce **bit-identical** keys on the server
  (Node) and the client (RN/Hermes). Any divergence in BigInt handling, byte order, PBKDF2, or the
  prime-rejection loop breaks recovery. Add cross-environment determinism tests (Phase 7).
- **Test every primitive against published test vectors** before wiring it into a flow (see Phase 7).
  A crypto bug that "runs" but produces wrong bytes is the worst-case outcome.
- **Keep the decrypted private key in memory only** (or Expo SecureStore for the session). Never
  persist or log it in plaintext. Never log passwords, seeds, or AES keys.
- **Small, reviewable PRs**, one phase at a time, each with its tests.
- **Comment policy (requested):** remove incidental inline comments; put one **meaningful block
  comment at the top of each module / major function** describing what it does and, for crypto,
  which **standard + test vector** it follows (e.g. "AES-256 CTR — FIPS-197; vectors NIST SP 800-38A").
  Keep standard/RFC references — those are the "meaningful" comments.

---

## 5. Phased task plan

Each task is a checkbox. Acceptance criteria ("Done when") are mandatory.

### Phase 0 — Hygiene & unblockers (do first, low risk)

- [ ] **Fix the extensionless dead files.** Rename `backend/src/queries/userQueries` →
      `userQueries.ts`. Confirm there are no other extensionless source files (there was also a stray
      `mobile/components/SocketConnection` with no extension — delete it).
      *Done when:* `userQueries.ts` imports cleanly and `tsc --noEmit` passes in `backend/`.
- [ ] **Centralize client config.** Move `API_URL`/`SOCKET_URL` into one module (or
      `expo-constants` extra / `EXPO_PUBLIC_*` env). `mobile/lib/socket.ts` already reads
      `process.env.EXPO_PUBLIC_SOCKET_URL`; make `mobile/lib/axios.ts` consistent.
      *Done when:* one place controls both URLs.
- [ ] **Clean `Pbkdf2.ts` formatting** (the jammed two-statements-on-one-line block) without changing
      behavior. *Done when:* RFC 6070 vectors still pass (Phase 7).

### Phase 1 — Database schema (MySQL + Mongo)

- [ ] **MySQL migration** to extend `Users` with: `userPassword VARCHAR`, `publicKey TEXT`,
      `privateKey TEXT` (stores the *encrypted* PEM blob `nonceHex:ctHex`), `keySalt VARCHAR`,
      `isVerified TINYINT(1) DEFAULT 0`, `createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`. Keep
      `clerkId` if staying hybrid. Make new columns nullable so existing Clerk rows survive.
      *Done when:* migration runs, existing rows intact, `userQueries.ts` `createEncryptedUser`
      matches the column list (add `isVerified`/`createdAt`/`profilePicture` handling).
- [ ] **Mongo `Message` schema** (`backend/src/models/Message.ts`): replace plaintext `text` with the
      encrypted package fields — `cipherText`, `iv`/`nonce`, `encryptedKeys` (map of recipientUserId →
      RSA-wrapped AES key; include the sender so they can read their own messages), `signature`,
      `senderId`, `chat`, `metadata`, `isDeleted`, timestamps. Align with the ERD
      (`messageID/cipherText/senderID/metaData/timeStamp/convoID/isDeleted`).
      *Done when:* new messages persist as ciphertext; decide whether to drop or migrate old plaintext
      messages (acceptable to wipe dev data).
- [ ] **Update `Chat`/conversation model** to match the ERD if needed (participants, lastMsg).

### Phase 2 — AES-256 (from scratch)

- [ ] Implement `backend/src/crypto/primitives/Aes256.ts`: key expansion (RotWord/SubWord/Rcon →
      15 round keys), and round transforms SubBytes (S-box via GF(2^8) inverse), ShiftRows,
      MixColumns (GF(2^8) mult), AddRoundKey. Provide a mode (CTR recommended; or CBC with PKCS#7).
      Expose `aesEncrypt(key, iv, plaintext)` / `aesDecrypt(key, iv, ciphertext)`.
      *Done when:* matches **NIST FIPS-197** block vectors and **SP 800-38A** mode vectors exactly.
- [ ] Decide if private-key-at-rest switches from ChaCha20 to AES for consistency (optional).

### Phase 3 — RSA encryption & signatures (padding)

- [ ] `backend/src/crypto/rsa/RsaOaep.ts` — RSA-OAEP (MGF1/SHA-256) `encrypt`/`decrypt` built on
      `modPow`. Used to wrap/unwrap the AES key. *Done when:* round-trips, and decrypts a value
      produced by WebCrypto RSA-OAEP with the same key (interop test).
- [ ] `backend/src/crypto/rsa/RsaSign.ts` — RSA signature (PSS or PKCS#1 v1.5 over SHA-256)
      `sign`/`verify`. *Done when:* a tampered byte fails `verify`; interop with WebCrypto verify.
- [ ] (If staying with the proposal's "JWT signature" wording, document that the signature here is an
      RSA signature over the canonical encrypted package, serialized JWT-style. HMAC is symmetric and
      cannot prove sender identity — do not use HMAC for sender authenticity.)

### Phase 4 — Message orchestration (shared core)

- [ ] `crypto/message/EncryptMessage.ts`: input plaintext + recipient public key(s) + sender private
      key → `{ cipherText, iv, encryptedKeys, signature }`. Steps: random AES key → AES-encrypt →
      RSA-OAEP wrap key per recipient (and self) → RSA-sign the canonical package.
- [ ] `crypto/message/DecryptMessage.ts`: input package + my private key + sender public key →
      verify signature → unwrap my AES key → AES-decrypt → plaintext. Reject on bad signature.
      *Done when:* A→B encrypt/decrypt round-trips; B sees correct plaintext; tamper → rejected;
      a third party without the private key cannot read it.

### Phase 5 — Make the crypto run on the client (RN)

- [ ] **Port/share the needed modules to `mobile/`** (`mobile/lib/crypto/`). The pure-TS modules
      (Sha256, Hmac, Pbkdf2, ChaCha20, AES, RSA math/OAEP/sign, DER, message orchestration, seed
      chain) are portable. Replace Node-only bits: `Buffer` → `Uint8Array`/hex helpers;
      `webcrypto.getRandomValues` → `expo-crypto`'s `getRandomBytes`. Consider a shared workspace
      package to avoid drift, or copy with a single source of truth + a sync check.
      *Done when:* the same recovery words produce the **same** keys in Node and in the RN app
      (determinism test on-device/simulator).
- [ ] **Unlock-on-login:** after login, client fetches its `encryptedPrivateKey` + `keySalt`, prompts
      for the encryption password, derives the key (PBKDF2 310k), decrypts the private key, holds it in
      memory for the session. Show a clear "unlocking…" state (PBKDF2 is slow in JS).
      *Done when:* private key is available client-side without ever leaving the device in plaintext.

### Phase 6 — Wire crypto into the product flows

- [ ] **Sign-up** (server): generate seed → derive keypair (`generateRSAKeyPairFromSeed`) → hash the
      password (`hashPassword`) → encrypt private key (`encryptPrivateKey`) → `createEncryptedUser` →
      **email the recovery words** → set `isVerified=0` until email/2FA confirmed.
- [ ] **Email service** (`backend/src/services/email.ts`, e.g. Nodemailer + SMTP/provider): send
      recovery-words email and numeric verification codes. Never email the password or private key.
- [ ] **Email/2FA verification endpoints**: issue + verify a code; flip `isVerified=1`. Gate
      messaging on verified.
- [ ] **Recovery-words backup UI** (mobile): a one-time screen after sign-up showing the words with a
      "I've saved these" confirmation (don't rely only on email).
- [ ] **Send message**: replace the plaintext path. `mobile` encrypts client-side (Phase 4) and emits
      the package over the socket; `backend/src/utils/socket.ts` stores the **ciphertext package** in
      Mongo and relays it untouched. `getMessages` returns ciphertext.
      *Done when:* the DB/relay only ever sees ciphertext (grep the stored row — it must be unreadable).
- [ ] **Receive/display**: `mobile` decrypts each message client-side before rendering in
      `MessageBubble`. Show a graceful state for messages that fail to decrypt/verify.
- [ ] **Forgot-password flow**:
      - UI: "Forgot password" entry on the login/main menu → screen to enter recovery words + new
        password.
      - Client: re-derive keypair from words (`generateRSAKeyPairFromSeed`), confirm the derived
        public key matches the stored one, encrypt the (re-derived) private key under the new
        password, hash the new password.
      - Server: require email/2FA verification, then update `userPassword`, `privateKey`, `keySalt`.
      - **Note (correct the original phrasing):** the server does *not* "decrypt and re-encrypt" the
        key — the **client** re-derives it from the seed and re-encrypts under the new password. Old
        messages remain readable because the recovered private key is identical, so all previously
        RSA-wrapped AES keys still unwrap. No message re-encryption is needed.
      *Done when:* a user who "forgot" their password can recover with words + new password and still
      open old messages.

### Phase 7 — Testing & verification (do continuously, not last)

- [ ] **Primitive vectors:** SHA-256 (NIST), HMAC-SHA256 (RFC 4231), PBKDF2 (RFC 6070), ChaCha20
      (RFC 7539), AES-256 (FIPS-197 + SP 800-38A), RSA-OAEP/PSS interop with WebCrypto.
- [ ] **Determinism:** same 24 words → identical keys across Node and RN (golden-value test committed).
- [ ] **E2E:** A→B happy path; tampered ciphertext rejected; outsider cannot decrypt; forgot-password
      recovery preserves message access.
- [ ] **Performance:** measure RSA keygen (server) and PBKDF2 unlock (client) timings; confirm
      acceptable UX; if PBKDF2 is too slow on device, tune iterations consciously (document the
      security trade-off).
- [ ] Use a **subagent or second pass** to review the crypto wiring specifically.

### Phase 8 — UI/UX + final cleanup (requested "added features")

- [ ] **UI/UX pass** across `(auth)`, chat, `new-chat`, settings: consistent loading/empty/error
      states, the recovery-words backup screen, "verifying email" and "unlocking keys" states, a
      "message couldn't be decrypted" fallback, accessibility labels, and consistent theming.
- [ ] **Code cleanup:** remove dead/stray files, dedupe the user-shape mapping, consolidate config,
      remove unused imports, run lint/`tsc` clean on both `backend/` and `mobile/`.
- [ ] **Apply the comment policy** repo-wide (Section 4): strip incidental comments, add one
      meaningful top-of-block comment per module/major function, preserve standard/RFC/test-vector
      references in crypto.
- [ ] **Sanitize decrypted content** before rendering (defense-in-depth even in RN).

### Phase 9 — Later / out of core scope

- [ ] WebRTC full-mesh P2P video, group key management (proposal "future"). Treat as a separate
      project after 1:1 encrypted text is solid.

---

## 6. Bugs & risks found during the audit (the "look for bugs" ask)

1. **Miller-Rabin correctness claim is wrong for the actual key size.** `MillerRabin.ts` says the
   fixed 12-witness set is "certain" — that determinism guarantee only holds for n < ~3.3×10^24
   (~2^81). The primes here are **1024-bit**, so this is *probabilistic*. For random candidates the
   failure odds are astronomically small, but the comment is misleading; for rigor, use additional
   random-base rounds and fix the comment.
2. **Raw RSA has no padding.** Encrypting/signing with bare `modPow` is insecure and interop-broken.
   Phase 3 (OAEP/PSS) is mandatory before any RSA encrypt/sign is used.
3. **No authenticated encryption.** ChaCha20 (and AES-CTR/CBC) produce malleable ciphertext with no
   integrity tag — a flipped bit silently corrupts. The per-message RSA **signature** must cover the
   ciphertext (and the private-key-at-rest blob would benefit from an HMAC, or use AES-GCM).
4. **Cross-environment determinism is fragile.** The whole recovery model depends on Node and RN
   computing the identical seed→key chain (PBKDF2 + ChaCha20 RNG + prime rejection loop). Needs a
   committed golden-value test or recovery can silently produce a different key.
5. **`userQueries` has no `.ts` extension** → not importable, currently dead. (Same class of stray-file
   bug as the extensionless `SocketConnection` found earlier.)
6. **`createEncryptedUser` ignores `isVerified`/`createdAt`/`profilePicture`** and assumes columns the
   live table doesn't have yet — needs the Phase 1 migration and reconciliation with Clerk-created rows.
7. **Auth split risk.** Existing users were created via Clerk (`authCallback`) and have no
   `userPassword`/keys. Decide migration/backfill or a dual-path so they aren't locked out.
8. **`seedStringFromWords` concatenates 2-digit codes as a decimal string** ("10"+"11"="1011"). Safe
   only while every code is exactly 2 digits (dictionary < 90 words after offset 10). Document/guard
   this, or delimit the codes.
9. **Pure-JS RSA keygen + 310k PBKDF2 are slow.** Fine on the server; on a phone they can take seconds.
   Keep keygen server-side; surface a spinner for the client unlock; tune iterations deliberately.
10. **Plaintext message migration.** Switching `Message` to ciphertext breaks existing plaintext rows
    and the current send path — wipe dev data or write a migration.
11. **Never log secrets.** Audit for accidental `console.log` of passwords, seeds, private keys, AES
    keys (the old `handleSend` logged `currentUser`; keep that discipline).

---

## 7. Suggested order of execution (dependency-aware)

Phase 0 → Phase 1 → Phase 2 (AES) ∥ Phase 3 (RSA OAEP/sign) → Phase 4 (orchestration) →
Phase 7 vectors for 2–4 → Phase 5 (client port + unlock) → Phase 6 (flows: signup/email/2FA/send/
receive/forgot) → Phase 7 E2E + determinism → Phase 8 (UI/UX + cleanup + comments) → Phase 9 (video).

Ship each phase behind its tests. Do not integrate a crypto module into a flow until its test
vectors pass.
