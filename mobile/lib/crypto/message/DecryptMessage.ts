// decrypt: verify sig, unwrap AES key, AES-CTR decrypt

import { aesDecrypt, hexToBytes } from "../primitives/Aes256";
import { rsaOaepDecrypt }         from "../rsa/RsaOaep";
import { rsaVerify }              from "../rsa/RsaSign";
import { base64ToBytes }          from "../utils/Bytes";
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

  // verify sig first
  const canonical = `${senderId}:${chatId}:${iv}:${cipherText}`;
  const valid = rsaVerify(senderPublicKeyPem, canonical, signature);
  if (!valid) {
    throw new Error("DecryptMessage: invalid signature — message rejected");
  }

  // find my wrapped key
  const wrappedKeyB64 = encryptedKeys[myUserId];
  if (!wrappedKeyB64) {
    throw new Error(`DecryptMessage: no encrypted key found for userId "${myUserId}"`);
  }

  // unwrap AES key
  const wrappedKeyBytes = base64ToBytes(wrappedKeyB64);
  const aesKey = rsaOaepDecrypt(myPrivateKeyPem, wrappedKeyBytes);

  // decrypt
  const ciphertextBytes = hexToBytes(cipherText);
  const ivBytes         = hexToBytes(iv);
  const plaintextBytes  = aesDecrypt(aesKey, ivBytes, ciphertextBytes);

  return new TextDecoder().decode(plaintextBytes);
}
