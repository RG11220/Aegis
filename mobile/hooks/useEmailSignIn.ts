/**
 * Email sign-in hook.
 *
 * After Clerk verifies the password, we transparently:
 *   1. Fetch the encrypted private key blob from our backend
 *   2. Run PBKDF2(password) + ChaCha20 decrypt to recover the RSA private key
 *   3. Store both keys in the in-memory crypto session
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
  const setKeys = useCryptoSession((s) => s.setKeys);
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async (
    email: string,
    password: string
  ): Promise<string | undefined> => {
    if (!isLoaded) return;

    setLoading(true);
    try {
      // 1. Clerk authentication
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete" && setActive) {
        await setActive({ session: result.createdSessionId });

        // 2. Fetch the encrypted private key from our backend.
        //    This runs after the Clerk session is active so apiWithAuth has a token.
        try {
          const { data } = await apiWithAuth<CryptoKeysResponse>({
            method: "GET",
            url: "/auth/crypto-keys",
          });

          // 3. Decrypt the private key with the same password the user just typed.
          //    PBKDF2 at 310k iterations — takes ~1-3 s on device.
          const privateKeyPem = await decryptPrivateKeyAsync(
            data.encryptedPrivateKey,
            data.keySalt,
            password
          );

          // 4. Store in memory for the session.
          setKeys(privateKeyPem, data.publicKey);
        } catch (cryptoErr) {
          // Log but do not block login — the user can still use the app for
          // features that don't require decryption. Keys will be absent until
          // the next sign-in attempt.
          console.error("[Crypto] Failed to load keys after sign-in:", cryptoErr);
        }
      }
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? "Sign in failed";
      console.error(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  return { handleEmailSignIn, loading };
}

export default useEmailSignIn;
