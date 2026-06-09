// sign up, verify email, generate + store keys in background

import { InteractionManager } from "react-native";
import { useSignUp } from "@clerk/clerk-expo";
import { useRef, useState } from "react";
import { useApi } from "@/lib/axios";
import { API_URL } from "@/lib/config";
import { generateRSAKeyPairFromSeed, generateSeedPhrase } from "@/lib/crypto/rsa/RsaFromSeed";
import { encryptPrivateKey } from "@/lib/crypto/password/Encryptprivatekey";
import { useCryptoSession } from "@/lib/cryptoSession";

function useEmailSignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { apiWithAuth } = useApi();
  const setKeys = useCryptoSession((s) => s.setKeys);

  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<string>("");

  const handleSignUp = async (
    email: string,
    password: string
  ): Promise<string | undefined> => {
    if (!isLoaded) return;

    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      passwordRef.current = password;
      setPendingVerification(true);
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? "Sign up failed";
      console.error(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  const isSecureApiUrl = () => {
    const isProd = typeof __DEV__ === "boolean" ? !__DEV__ : process.env.NODE_ENV === "production";
    return !isProd || API_URL.toLowerCase().startsWith("https://");
  };

  const handleVerify = async (code: string): Promise<string | undefined> => {
    if (!isLoaded) return;
    if (!isSecureApiUrl()) {
      throw new Error("Insecure API_URL configured; HTTPS is required for auth operations.");
    }

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete" && setActive) {
        await setActive({ session: result.createdSessionId });

        try {
          await apiWithAuth({ method: "POST", url: "/auth/callback" });

          const password = passwordRef.current;

          const { publicKeyPem, privateKeyPem, encryptedPrivateKey, keySalt, seedPhrase } =
            await new Promise<{
              publicKeyPem: string;
              privateKeyPem: string;
              encryptedPrivateKey: string;
              keySalt: string;
              seedPhrase: string[];
            }>((resolve, reject) => {
              InteractionManager.runAfterInteractions(async () => {
                try {
                  const seedPhrase = generateSeedPhrase();
                  const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(seedPhrase);
                  const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);
                  resolve({ publicKeyPem, privateKeyPem, encryptedPrivateKey, keySalt, seedPhrase });
                } catch (err) {
                  reject(err);
                }
              });
            });

          await apiWithAuth({
            method: "POST",
            url: "/auth/register-keys",
            data: { publicKey: publicKeyPem, encryptedPrivateKey, keySalt, seedPhrase },
          });

          setKeys(privateKeyPem, publicKeyPem);
        } catch (cryptoErr) {
          console.error("[Crypto] Failed to set up keys after sign-up:", cryptoErr);
        } finally {
          passwordRef.current = "";
        }
      }
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? "Verification failed";
      console.error(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  return { handleSignUp, handleVerify, pendingVerification, loading };
}

export default useEmailSignUp;
