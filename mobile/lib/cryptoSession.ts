// in-memory key store, never persisted to disk

import { create } from "zustand";

interface CryptoSession {
  privateKeyPem: string | null;
  publicKeyPem: string | null;
  // true if decryption failed after password reset — needs seed recovery
  keyLoadFailed: boolean;

  setKeys: (privateKeyPem: string, publicKeyPem: string) => void;
  setKeyLoadFailed: (failed: boolean) => void;
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
