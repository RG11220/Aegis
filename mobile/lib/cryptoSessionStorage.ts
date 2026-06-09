// Persists the decrypted RSA key pair so the session survives app restarts.
//   - Native (iOS/Android): the OS secure keychain via expo-secure-store.
//   - Web: SecureStore has NO web implementation, so we fall back to localStorage.
//     (localStorage is readable by any script on the page — fine for dev/web parity,
//      but less secure than the native keychain; harden before a real web deploy.)
// Keys are scoped to the Clerk user ID so multi-account devices work correctly.

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PREFIX = "aegis_crypto_";
const isWeb = Platform.OS === "web";

/** SecureStore keys must be alphanumeric + ".", "-", "_" only. */
function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function privateKeyName(id: string) {
  return `${PREFIX}priv_${sanitize(id)}`;
}
function publicKeyName(id: string) {
  return `${PREFIX}pub_${sanitize(id)}`;
}

// Platform-aware storage primitives.
async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}
async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Save decrypted PEM keys to the device keychain (or localStorage on web). */
export async function persistKeys(
  clerkUserId: string,
  privateKeyPem: string,
  publicKeyPem: string
): Promise<void> {
  try {
    await setItem(privateKeyName(clerkUserId), privateKeyPem);
    await setItem(publicKeyName(clerkUserId), publicKeyPem);
    console.log("[CryptoStore] Keys persisted for user:", clerkUserId.slice(0, 12));
  } catch (e) {
    console.warn("[CryptoStore] Failed to persist keys:", e);
  }
}

/** Load decrypted PEM keys. Returns null if not found. */
export async function loadPersistedKeys(
  clerkUserId: string
): Promise<{ privateKeyPem: string; publicKeyPem: string } | null> {
  try {
    const [priv, pub] = await Promise.all([
      getItem(privateKeyName(clerkUserId)),
      getItem(publicKeyName(clerkUserId)),
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

/** Remove keys (e.g. on sign-out). */
export async function clearPersistedKeys(clerkUserId: string): Promise<void> {
  try {
    await deleteItem(privateKeyName(clerkUserId));
    await deleteItem(publicKeyName(clerkUserId));
  } catch (e) {
    console.warn("[CryptoStore] Failed to clear persisted keys:", e);
  }
}
