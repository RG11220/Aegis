import { aesDecrypt, hexToBytes } from "../primitives/Aes256";
import { rsaOaepDecrypt }         from "../rsa/RsaOaep";
import { rsaVerify }              from "../rsa/RsaSign";
import type { EncryptedPackage }  from "./EncryptMessage";

export interface DecryptMessageParams {
  pkg: EncryptedPackage;
  chatId: string;
  senderId: string;
  senderPublicKeyPem: string;
  myUserId: string;
  myPrivateKeyPem: string;
}

export function decryptMessage(params: DecryptMessageParams): string {
  const { pkg, chatId, senderId, senderPublicKeyPem, myUserId, myPrivateKeyPem } = params;
  const { cipherText, iv, encryptedKeys, signature } = pkg;

  // sig first, always
  const canonical = `${senderId}:${chatId}:${iv}:${cipherText}`;
  const valid = rsaVerify(senderPublicKeyPem, canonical, signature);
  if (!valid) {
    throw new Error("DecryptMessage: invalid signature — message rejected");
  }

  const wrappedKeyB64 = encryptedKeys[myUserId];
  if (!wrappedKeyB64) {
    throw new Error(`DecryptMessage: no encrypted key found for userId "${myUserId}"`);
  }

  const wrappedKeyBytes = Uint8Array.from(Buffer.from(wrappedKeyB64, "base64"));
  const aesKey = rsaOaepDecrypt(myPrivateKeyPem, wrappedKeyBytes);

  const ciphertextBytes = hexToBytes(cipherText);
  const ivBytes         = hexToBytes(iv);
  const plaintextBytes  = aesDecrypt(aesKey, ivBytes, ciphertextBytes);

  return new TextDecoder().decode(plaintextBytes);
}
