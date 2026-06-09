import { Message } from "@/types";
import { View, Text } from "react-native";
import { useMemo } from "react";
import { useCryptoSession } from "@/lib/cryptoSession";
import { decryptMessage } from "@/lib/crypto/message/DecryptMessage";

const getUserFriendlyDecryptionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Speak plainly; never surface raw crypto errors to the user.
  if (/no encrypted key|not encrypted for/i.test(message)) return "This message wasn't encrypted for your account";
  if (/signature/i.test(message)) return "Couldn't verify this message";
  if (/missing|not loaded|no private key/i.test(message)) return "🔒 Unlock to read this message";
  if (/cipher|decrypt|decryption|pem|key/i.test(message)) return "Couldn't decrypt this message";
  return "Couldn't read this message";
};

interface MessageBubbleProps {
  message: Message;
  isFromMe: boolean;
  senderPublicKeyPem: string | null;
  myUserId: string;
}

function MessageBubble({ message, isFromMe, senderPublicKeyPem, myUserId }: MessageBubbleProps) {
  const { privateKeyPem } = useCryptoSession();

  const displayText = useMemo(() => {
    // already plaintext (optimistic or legacy)
    if (message.text) return message.text;

    // encrypted, decrypt now
    if (message.cipherText && message.iv && message.encryptedKeys && message.signature) {
      if (!privateKeyPem) return "🔒 Unlock to read this message";
      if (!senderPublicKeyPem) return "Verifying sender…";

      try {
        return decryptMessage({
          pkg: {
            cipherText: message.cipherText,
            iv: message.iv,
            encryptedKeys: message.encryptedKeys,
            signature: message.signature,
          },
          chatId: message.chat,
          senderId: message.senderId,
          senderPublicKeyPem,
          myUserId,
          myPrivateKeyPem: privateKeyPem,
        });
      } catch (e: any) {
        return getUserFriendlyDecryptionError(e);
      }
    }

    return "";
  }, [message, privateKeyPem, senderPublicKeyPem, myUserId]);

  return (
    <View className={`flex-row ${isFromMe ? "justify-end" : "justify-start"}`}>
      <View
        className={`max-w-[80%] px-3 py-2 rounded-2xl ${
          isFromMe
            ? "bg-primary rounded-br-sm"
            : "bg-surface-light rounded-bl-sm border border-surface-light"
        }`}
      >
        <Text className={`text-sm ${isFromMe ? "text-surface-dark" : "text-foreground"}`}>
          {displayText}
        </Text>
      </View>
    </View>
  );
}

export default MessageBubble;
