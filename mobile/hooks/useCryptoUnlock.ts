// Unlocks (or provisions) crypto keys for an already-authenticated user.
// Works for both email/password and OAuth (Google/Apple) accounts.

import { useState } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useApi } from "@/lib/axios";
import { decryptPrivateKeyAsync } from "@/lib/crypto/password/Encryptprivatekey";
import { encryptPrivateKey } from "@/lib/crypto/password/Encryptprivatekey";
import { generateRSAKeyPairFromSeed, generateSeedPhrase } from "@/lib/crypto/rsa/RsaFromSeed";
import { keyPairMatches } from "@/lib/crypto/rsa/RsaSign";
import { useCryptoSession } from "@/lib/cryptoSession";
import { persistKeys } from "@/lib/cryptoSessionStorage";

interface CryptoKeysResponse {
  publicKey: string;
  encryptedPrivateKey: string;
  keySalt: string;
}

export function useCryptoUnlock() {
  const { user } = useUser();
  const { apiWithAuth } = useApi();
  const setKeys = useCryptoSession((s) => s.setKeys);
  const setKeyLoadFailed = useCryptoSession((s) => s.setKeyLoadFailed);
  const [loading, setLoading] = useState(false);

  /**
   * Try to fetch + decrypt existing keys, or provision new ones.
   * Returns an error string on failure, undefined on success.
   */
  const unlock = async (password: string): Promise<string | undefined> => {
    if (!password.trim()) return "Please enter a password.";

    setLoading(true);
    try {
      let keysResponse: CryptoKeysResponse | null = null;

      try {
        console.log("[CryptoUnlock] fetching keys...");
        const { data } = await apiWithAuth<CryptoKeysResponse>({
          method: "GET",
          url: "/auth/crypto-keys",
        });
        keysResponse = data;
        console.log("[CryptoUnlock] keys fetched, publicKey prefix:", data.publicKey?.slice(0, 40));
      } catch (fetchErr: any) {
        console.log("[CryptoUnlock] fetch error status:", fetchErr?.response?.status);
        if (fetchErr?.response?.status !== 404) throw fetchErr;
        keysResponse = null;
      }

      if (keysResponse) {
        try {
          console.log("[CryptoUnlock] decrypting private key...");
          const privateKeyPem = await decryptPrivateKeyAsync(
            keysResponse.encryptedPrivateKey,
            keysResponse.keySalt,
            password
          );
          // The decrypted private key must match the account's public key. If it
          // doesn't, the stored pair is out of sync (every message would fail with
          // "Invalid signature") — route to seed-phrase recovery instead.
          if (!keyPairMatches(privateKeyPem, keysResponse.publicKey)) {
            console.warn("[CryptoUnlock] key pair mismatch — private key does not match stored public key");
            setKeyLoadFailed(true);
            return "Your saved keys don't match this account on this device. Recover with your seed phrase to fix this.";
          }
          console.log("[CryptoUnlock] decrypted OK, calling setKeys...");
          setKeys(privateKeyPem, keysResponse.publicKey);
          console.log("[CryptoUnlock] setKeys done");
          const email = user?.primaryEmailAddress?.emailAddress;
          if (email) await persistKeys(email, privateKeyPem, keysResponse.publicKey);
          console.log("[CryptoUnlock] success — keys loaded");
          return undefined;
        } catch (decryptErr: any) {
          console.warn("[CryptoUnlock] decrypt failed:", decryptErr?.message);
          return "Wrong password. Please try again.";
        }
      } else {
        console.log("[CryptoUnlock] no keys found, provisioning new ones...");
        const seedPhrase = generateSeedPhrase();
        const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(seedPhrase);
        const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);

        await apiWithAuth({
          method: "POST",
          url: "/auth/register-keys",
          data: { publicKey: publicKeyPem, encryptedPrivateKey, keySalt, seedPhrase },
        });

        setKeys(privateKeyPem, publicKeyPem);
        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) await persistKeys(email, privateKeyPem, publicKeyPem);
        console.log("[CryptoUnlock] provisioned new keys");
        return undefined;
      }
    } catch (err: any) {
      console.error("[CryptoUnlock] error:", err);
      return err?.response?.data?.message ?? err?.message ?? "Something went wrong. Please try again.";
    } finally {
      setLoading(false);
    }
  };

  return { unlock, loading };
}
