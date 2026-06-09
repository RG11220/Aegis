// in-memory key store, never persisted to disk

import { create } from "zustand";

interface CryptoSession {
  privateKeyPem: string | null;
  publicKeyPem: string | null;
  // true if decryption failed after password reset — needs seed recovery
  keyLoadFailed: boolean;
  // 24-word phrase to show the user once, right after provisioning new keys
  pendingSeedPhrase: string[] | null;

  setKeys: (privateKeyPem: string, publicKeyPem: string) => void;
  setKeyLoadFailed: (failed: boolean) => void;
  setPendingSeedPhrase: (words: string[] | null) => void;
  clear: () => void;
}

export const useCryptoSession = create<CryptoSession>((set) => ({
  privateKeyPem: null,
  publicKeyPem:  null,
  keyLoadFailed: false,
  pendingSeedPhrase: null,

  setKeys: (privateKeyPem, publicKeyPem) =>
    set({ privateKeyPem, publicKeyPem, keyLoadFailed: false }),

  setKeyLoadFailed: (failed) => set({ keyLoadFailed: failed }),

  setPendingSeedPhrase: (words) => set({ pendingSeedPhrase: words }),

  clear: () => set({ privateKeyPem: null, publicKeyPem: null, keyLoadFailed: false, pendingSeedPhrase: null }),
}));
