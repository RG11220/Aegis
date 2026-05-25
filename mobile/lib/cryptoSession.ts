/**
 * In-memory crypto session store — Phase 5.
 *
 * Holds the user's decrypted RSA private key PEM for the lifetime of the app session.
 * The key is never persisted to disk (no AsyncStorage / SecureStore).
 * It must be re-derived from the password after every cold start.
 *
 * Usage:
 *   // After unlocking:
 *   useCryptoSession.getState().setKeys(privateKeyPem, publicKeyPem);
 *
 *   // In crypto operations:
 *   const { privateKeyPem } = useCryptoSession();
 *   if (!privateKeyPem) { /* show unlock modal *\/ }
 *
 *   // On sign-out:
 *   useCryptoSession.getState().clear();
 */

import { create } from "zustand";

interface CryptoSession {
  /** Decrypted PKCS#8 PEM private key — null until the user has unlocked. */
  privateKeyPem: string | null;
  /** SPKI PEM public key — populated alongside privateKeyPem. */
  publicKeyPem: string | null;
  /**
   * True when sign-in succeeded but key decryption failed (wrong password after
   * a Clerk password reset). The user needs to go through the seed-phrase recovery
   * flow to re-encrypt their private key with the new password.
   */
  keyLoadFailed: boolean;

  /** Store both keys after a successful unlock. */
  setKeys: (privateKeyPem: string, publicKeyPem: string) => void;
  /** Mark that key decryption failed so the recovery prompt is shown. */
  setKeyLoadFailed: (failed: boolean) => void;
  /** Wipe keys from memory (call on sign-out or app background). */
  clear: () => void;
}

export const useCryptoSession = create<CryptoSession>((set) => ({
  privateKeyPem: null,
  publicKeyPem:  null,
  keyLoadFailed: false,

  setKeys: (privateKeyPem, publicKeyPem) =>
    set({ privateKeyPem, publicKeyPem, keyLoadFailed: false }),

  setKeyLoadFailed: (failed) => set({ keyLoadFailed: failed }),

  clear: () => set({ privateKeyPem: null, publicKeyPem: null, keyLoadFailed: false }),
}));
