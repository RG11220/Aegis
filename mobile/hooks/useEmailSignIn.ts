// sign in then load crypto keys in background

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
              // no keys yet, provision server-side
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
              console.warn("[Crypto] decrypt failed, flag for recovery:", decryptErr.message);
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
