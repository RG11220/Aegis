// Persists decrypted RSA key pair to the device's secure keychain (expo-secure-store).
// Keys are scoped to the Clerk user ID so multi-account devices work correctly.
// This file is the ONLY place that touches SecureStore for crypto keys.

import * as SecureStore from "expo-secure-store";

const PREFIX = "aegis_crypto_";

/** SecureStore keys must be alphanumeric + ".", "-", "_" only. */
function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function privateKey(id: string) {
  return `${PREFIX}priv_${sanitize(id)}`;
}
function publicKey(id: string) {
  return `${PREFIX}pub_${sanitize(id)}`;
}

/** Save decrypted PEM keys to the device keychain. */
export async function persistKeys(
  clerkUserId: string,
  privateKeyPem: string,
  publicKeyPem: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(privateKey(clerkUserId), privateKeyPem);
    await SecureStore.setItemAsync(publicKey(clerkUserId), publicKeyPem);
    console.log("[CryptoStore] Keys persisted for user:", clerkUserId.slice(0, 12));
  } catch (e) {
    console.warn("[CryptoStore] Failed to persist keys:", e);
  }
}

/** Load decrypted PEM keys from the device keychain. Returns null if not found. */
export async function loadPersistedKeys(
  clerkUserId: string
): Promise<{ privateKeyPem: string; publicKeyPem: string } | null> {
  try {
    const [priv, pub] = await Promise.all([
      SecureStore.getItemAsync(privateKey(clerkUserId)),
      SecureStore.getItemAsync(publicKey(clerkUserId)),
    ]);
    if (priv && pub) {
      console.log("[CryptoStore] Keys restored for user:", clerkUserId.slice(0, 12));
      return { privateKeyPem: priv, publicKeyPem: pub };
    }
  } catch (e) {
    console.warn("[CryptoStore] Failed to load persisted keys:", e);
  }
  return null;
}

/** Remove keys from keychain (e.g. on sign-out). */
export async function clearPersistedKeys(clerkUserId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(privateKey(clerkUserId));
    await SecureStore.deleteItemAsync(publicKey(clerkUserId));
  } catch (e) {
    console.warn("[CryptoStore] Failed to clear persisted keys:", e);
  }
}
