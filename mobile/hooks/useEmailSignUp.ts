/**
 * Email sign-up hook.
 *
 * After email verification completes, we transparently:
 *   1. Generate a random 24-word seed phrase
 *   2. Derive a deterministic RSA-2048 keypair from the seed
 *   3. Encrypt the private key with PBKDF2(password) + ChaCha20
 *   4. POST the encrypted blob + public key + seed phrase to our backend
 *      (backend stores the keys and emails the 24 words to the user)
 *   5. Store both keys in the in-memory crypto session
 *
 * The user only sees "Verifying…" — the seed phrase email arrives in the background.
 *
 * Note: the plaintext password is held in a ref between handleSignUp and
 * handleVerify (two separate user interactions). It is never persisted.
 */

import { InteractionManager } from "react-native";
import { useSignUp } from "@clerk/clerk-expo";
import { useRef, useState } from "react";
import { useApi } from "@/lib/axios";
import { generateRSAKeyPairFromSeed, generateSeedPhrase } from "@/lib/crypto/rsa/RsaFromSeed";
import { encryptPrivateKey } from "@/lib/crypto/password/Encryptprivatekey";
import { useCryptoSession } from "@/lib/cryptoSession";

function useEmailSignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { apiWithAuth } = useApi();
  const setKeys = useCryptoSession((s) => s.setKeys);

  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  // Hold the plaintext password between the two-step sign-up flow.
  // Never stored to disk — lives only in this hook's closure.
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

      // Stash the password so handleVerify can use it.
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

  const handleVerify = async (code: string): Promise<string | undefined> => {
    if (!isLoaded) return;

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete" && setActive) {
        await setActive({ session: result.createdSessionId });

        // ── Crypto setup (transparent to the user) ──────────────────────────
        try {
          // Sync the user into our SQL DB FIRST — register-keys uses protectRoute
          // which does SELECT WHERE clerkId = ?. Without this call the user row
          // doesn't exist yet and register-keys returns 404.
          // authCallback uses ON DUPLICATE KEY UPDATE, so calling it twice is safe.
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
                  // 1. Random 24-word seed phrase (no repeats)
                  const seedPhrase = generateSeedPhrase();

                  // 2. Deterministic RSA keypair from the seed
                  //    Same 24 words → always the same keypair (needed for recovery)
                  const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(seedPhrase);

                  // 3. Encrypt the private key with the user's password
                  const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);

                  resolve({ publicKeyPem, privateKeyPem, encryptedPrivateKey, keySalt, seedPhrase });
                } catch (err) {
                  reject(err);
                }
              });
            });

          // 4. POST to backend — stores encrypted blob + public key,
          //    and emails the 24-word seed phrase to the user.
          await apiWithAuth({
            method: "POST",
            url: "/auth/register-keys",
            data: { publicKey: publicKeyPem, encryptedPrivateKey, keySalt, seedPhrase },
          });

          // 5. Store in memory for the session.
          setKeys(privateKeyPem, publicKeyPem);
        } catch (cryptoErr) {
          // Keys failed to generate/store — user can still use the app but
          // E2E encryption won't work until they sign out and back in.
          console.error("[Crypto] Failed to set up keys after sign-up:", cryptoErr);
        } finally {
          // Clear the password from memory as soon as possible.
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
