/**
 * Email sign-up hook.
 *
 * After email verification completes, we transparently:
 *   1. Generate a random RSA-2048 keypair (client-side, ~200-800 ms)
 *   2. Encrypt the private key with PBKDF2(password) + ChaCha20
 *   3. POST the encrypted blob + public key to our backend for storage
 *   4. Store both keys in the in-memory crypto session
 *
 * The user only sees "Verifying…" — no mention of keys or crypto.
 *
 * Note: the plaintext password is held in a ref between handleSignUp and
 * handleVerify (two separate user interactions). It is never persisted.
 */

import { useSignUp } from "@clerk/clerk-expo";
import { useRef, useState } from "react";
import { useApi } from "@/lib/axios";
import { generateRandomRSAKeyPair } from "@/lib/crypto/rsa/RsaGenerate";
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
          const password = passwordRef.current;

          // 1. Generate a fresh RSA-2048 keypair (~200-800 ms).
          const { publicKeyPem, privateKeyPem } = await generateRandomRSAKeyPair();

          // 2. Encrypt the private key with the user's password (PBKDF2 + ChaCha20).
          const { encryptedPrivateKey, keySalt } = encryptPrivateKey(privateKeyPem, password);

          // 3. POST to backend — server stores the encrypted blob + public key.
          await apiWithAuth({
            method: "POST",
            url: "/auth/register-keys",
            data: { publicKey: publicKeyPem, encryptedPrivateKey, keySalt },
          });

          // 4. Store in memory for the session.
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
