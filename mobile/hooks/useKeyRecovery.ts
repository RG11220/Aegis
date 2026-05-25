/**
 * Key recovery hook.
 *
 * Flow (called after the user resets their Clerk password and signs back in):
 *   1. Take the 24 seed words + new password from the recovery screen
 *   2. Re-derive the RSA keypair deterministically from the words
 *   3. Re-encrypt the private key with the new password
 *   4. POST { words, newEncryptedPrivateKey, newKeySalt } to /auth/recover-keys
 *      (backend verifies that words → public key matches the stored public key)
 *   5. Store the keys in the in-memory crypto session
 */

import { useState } from "react";
import { useApi } from "@/lib/axios";
import { generateRSAKeyPairFromSeed } from "@/lib/crypto/rsa/RsaFromSeed";
import { encryptPrivateKey } from "@/lib/crypto/password/Encryptprivatekey";
import { useCryptoSession } from "@/lib/cryptoSession";

function useKeyRecovery() {
  const { apiWithAuth } = useApi();
  const setKeys = useCryptoSession((s) => s.setKeys);
  const [loading, setLoading] = useState(false);

  /**
   * Recover account keys using the 24-word seed phrase and a new password.
   *
   * @param words      The 24 seed words in order
   * @param password   The current Clerk password (used to re-encrypt the private key)
   * @returns undefined on success, error string on failure
   */
  const handleRecover = async (
    words: string[],
    password: string
  ): Promise<string | undefined> => {
    // apiWithAuth validates the base URL/protocol before sending; the seed phrase
    // is only posted over an HTTPS/TLS connection when this app is built for prod.
    if (words.length !== 24) return "Please enter all 24 words";
    if (!password)           return "Password is required";

    setLoading(true);
    try {
      // 1. Re-derive the deterministic RSA keypair from the seed words
      const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(words);

      // 2. Re-encrypt the private key with the new password
      const { encryptedPrivateKey: newEncryptedPrivateKey, keySalt: newKeySalt } =
        encryptPrivateKey(privateKeyPem, password);

      // 3. Backend verifies public key matches, then updates the stored encrypted blob
      await apiWithAuth({
        method: "POST",
        url: "/auth/recover-keys",
        data: { words, newEncryptedPrivateKey, newKeySalt },
      });

      // 4. Load keys into the in-memory session
      setKeys(privateKeyPem, publicKeyPem);

      return undefined; // success
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      if (serverMsg) return serverMsg;
      return err?.message ?? "Recovery failed";
    } finally {
      setLoading(false);
    }
  };

  return { handleRecover, loading };
}

export default useKeyRecovery;
