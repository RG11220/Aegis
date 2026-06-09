// recover keys via seed phrase after password reset

import { useState } from "react";
import { useApi } from "@/lib/axios";
import { useUser } from "@clerk/clerk-expo";
import { generateRSAKeyPairFromSeed } from "@/lib/crypto/rsa/RsaFromSeed";
import { encryptPrivateKey } from "@/lib/crypto/password/Encryptprivatekey";
import { useCryptoSession } from "@/lib/cryptoSession";
import { persistKeys } from "@/lib/cryptoSessionStorage";

function useKeyRecovery() {
  const { apiWithAuth } = useApi();
  const { user } = useUser();
  const setKeys = useCryptoSession((s) => s.setKeys);
  const [loading, setLoading] = useState(false);

  const handleRecover = async (
    words: string[],
    password: string
  ): Promise<string | undefined> => {
    if (words.length !== 24) return "Please enter all 24 words";
    if (!password)           return "Password is required";

    setLoading(true);
    try {
      // rederive keypair from seed
      const { publicKeyPem, privateKeyPem } = await generateRSAKeyPairFromSeed(words);

      // re-encrypt with new password
      const { encryptedPrivateKey: newEncryptedPrivateKey, keySalt: newKeySalt } =
        encryptPrivateKey(privateKeyPem, password);

      // backend verifies pubkey matches stored, updates blob
      await apiWithAuth({
        method: "POST",
        url: "/auth/recover-keys",
        data: { words, newEncryptedPrivateKey, newKeySalt },
      });

      setKeys(privateKeyPem, publicKeyPem);
      const email = user?.primaryEmailAddress?.emailAddress;
      if (email) await persistKeys(email, privateKeyPem, publicKeyPem);

      return undefined;
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
