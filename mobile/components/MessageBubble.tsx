import { Message } from "@/types";
import { View, Text } from "react-native";
import { useMemo } from "react";
import { useCryptoSession } from "@/lib/cryptoSession";
import { decryptMessage } from "@/lib/crypto/message/DecryptMessage";

interface MessageBubbleProps {
  message: Message;
  isFromMe: boolean;
  /** Public key of the message sender — required to verify the signature. */
  senderPublicKeyPem: string | null;
  /** Current user's ID — used to look up the correct encryptedKeys slot. */
  myUserId: string;
}

function MessageBubble({ message, isFromMe, senderPublicKeyPem, myUserId }: MessageBubbleProps) {
  const { privateKeyPem } = useCryptoSession();

  const displayText = useMemo(() => {
    // Optimistic / legacy messages already have plaintext
    if (message.text) return message.text;

    // Encrypted message — decrypt client-side
    if (message.cipherText && message.iv && message.encryptedKeys && message.signature) {
      if (!privateKeyPem) return "🔒 Keys not loaded";
      if (!senderPublicKeyPem) return "🔒 Sender key unavailable";

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
        // Surface the specific failure (signature / missing key / cipher) for debugging.
        return `⚠️ ${e?.message ?? "Decryption failed"}`;
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
            : "bg-surface-card rounded-bl-sm border border-surface-light"
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
