/**
 * Email sign-in hook.
 *
 * After Clerk verifies the password, we transparently:
 *   1. Fetch the encrypted private key blob from our backend
 *   2. Run PBKDF2(password) + ChaCha20 decrypt to recover the RSA private key
 *   3. Store both keys in the in-memory crypto session
 *
 * If the account has no keys yet (existing users before Phase 5), we generate
 * and register them on the spot using the password that's still in memory.
 *
 * If decryption fails (MAC mismatch — happens when the user reset their Clerk password
 * but the stored key blob is still encrypted with the old password), we set
 * `keyLoadFailed = true` in the crypto session. The settings screen will then show
 * a "Recover with seed phrase" prompt.
 *
 * The user sees nothing extra — it all happens in the background
 * while the normal auth redirect is taking place.
 */

import { useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { useApi } from "@/lib/axios";
import { decryptPrivateKeyAsync } from "@/lib/crypto/password/Encryptprivatekey";
import { useCryptoSession } from "@/lib/cryptoSession";

interface CryptoKeysResponse {
  publicKey: string;
  encryptedPrivateKey: string;
  keySalt: string;
}

function useEmailSignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { apiWithAuth } = useApi();
  const setKeys          = useCryptoSession((s) => s.setKeys);
  const setKeyLoadFailed = useCryptoSession((s) => s.setKeyLoadFailed);
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async (
    email: string,
    password: string
  ): Promise<string | undefined> => {
    if (!isLoaded) return;

    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });

      if (result.status !== "complete") {
        return `Sign-in couldn't complete (status: ${result.status}). Try again or use Google sign-in.`;
      }

      if (result.status === "complete" && setActive) {
        await setActive({ session: result.createdSessionId });

        try {
          let keysResponse: CryptoKeysResponse | null = null;

          try {
            const { data } = await apiWithAuth<CryptoKeysResponse>({
              method: "GET",
              url: "/auth/crypto-keys",
            });
            keysResponse = data;
          } catch (fetchErr: any) {
            const status = fetchErr?.response?.status;

            if (status === 404) {
              // No keys yet — provision them server-side (avoids freezing the JS
              // thread with on-device RSA-2048 keygen which takes several seconds).
              console.log("[Crypto] No keys found — provisioning via server");

              const { data } = await apiWithAuth<{ publicKey: string; privateKey: string }>({
                method: "POST",
                url: "/auth/provision-keys",
                data: { password },
              });

              setKeys(data.privateKey, data.publicKey);
              return;
            }

            throw fetchErr;
          }

          if (keysResponse) {
            try {
              const privateKeyPem = await decryptPrivateKeyAsync(
                keysResponse.encryptedPrivateKey,
                keysResponse.keySalt,
                password
              );
              setKeys(privateKeyPem, keysResponse.publicKey);
            } catch (decryptErr: any) {
              console.warn("[Crypto] Key decryption failed — flagging for seed-phrase recovery:", decryptErr.message);
              setKeyLoadFailed(true);
            }
          }
        } catch (cryptoErr) {
          console.error("[Crypto] Failed to load keys after sign-in:", cryptoErr);
        }
      }
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage || error.errors?.[0]?.message || "Sign in failed";
      console.error(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  return { handleEmailSignIn, loading };
}

export default useEmailSignIn;
