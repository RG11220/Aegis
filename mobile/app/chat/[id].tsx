import EmptyUI from "@/components/EmptyUI";
import MessageBubble from "@/components/MessageBubble";
import { useCurrentUser } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useSocketStore } from "@/lib/socket";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import type { Chat } from "@/types";

type ChatParams = {
  id: string;
  participantId: string;
  name: string;
  avatar: string;
};

const ChatDetailScreen = () => {
  const { id: chatId, avatar, name, participantId } = useLocalSearchParams<ChatParams>();

  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { data: messages, isLoading } = useMessages(chatId);

  const { joinChat, leaveChat, sendMessage, sendTyping, isConnected, onlineUsers, typingUsers } =
    useSocketStore();

  const isOnline = participantId ? onlineUsers.has(participantId) : false;
  const isTyping = typingUsers.get(chatId) === participantId;

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // get pubkey from cache, not route params
  const chats = queryClient.getQueryData<Chat[]>(["chats"]);
  const participantPublicKey = useMemo(() => {
    const chat = chats?.find((c) => c._id === chatId);
    return chat?.participant.publicKey ?? null;
  }, [chatId, chats]);

  // join/leave socket room
  useEffect(() => {
    if (chatId && isConnected) joinChat(chatId);

    return () => {
      if (chatId) leaveChat(chatId);
    };
  }, [chatId, isConnected, joinChat, leaveChat]);

  // scroll on new messages
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleTyping = useCallback(
    (text: string) => {
      setMessageText(text);

      if (!isConnected || !chatId) return;

      if (text.length > 0) {
        sendTyping(chatId, true);

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          sendTyping(chatId, false);
        }, 2000);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        sendTyping(chatId, false);
      }
    },
    [chatId, isConnected, sendTyping]
  );

  const handleSend = async () => {
    if (!messageText.trim() || isSending || !isConnected || !currentUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTyping(chatId, false);

    const partPubKey = participantPublicKey;
    if (!partPubKey || !participantId) {
      Alert.alert(
        "Can't send yet",
        "The recipient's encryption key is not available. Please wait until the conversation is fully initialized."
      );
      return;
    }

    const recipients = [
      { userId: currentUser._id, publicKeyPem: currentUser.publicKey },
      { userId: participantId, publicKeyPem: partPubKey },
    ].filter(
      (r): r is { userId: string; publicKeyPem: string } => Boolean(r.publicKeyPem)
    );

    if (recipients.length < 2) {
      Alert.alert(
        "Can't send yet",
        "Both participants need valid encryption keys before messages can be sent."
      );
      return;
    }

    setIsSending(true);
    try {
      await sendMessage(
        chatId,
        messageText.trim(),
        {
          _id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email,
          avatar: currentUser.avatar,
          publicKey: currentUser.publicKey ?? null,
        },
        recipients
      );
      setMessageText("");
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (sendError: any) {
      const message = sendError?.message ?? "Message failed to send.";
      Alert.alert("Send failed", message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <View className="flex-row items-center px-4 py-2 bg-surface border-b border-surface-light">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#F4A261" />
        </Pressable>
        <View className="flex-row items-center flex-1 ml-2">
          {avatar && <Image source={avatar} style={{ width: 40, height: 40, borderRadius: 999 }} />}
          <View className="ml-3">
            <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
              {name}
            </Text>
            <Text className={`text-xs ${isTyping ? "text-primary" : "text-muted-foreground"}`}>
              {isTyping ? "typing..." : isOnline ? "Online" : "Offline"}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable className="w-9 h-9 rounded-full items-center justify-center">
            <Ionicons name="call-outline" size={20} color="#A0A0A5" />
          </Pressable>
          <Pressable className="w-9 h-9 rounded-full items-center justify-center">
            <Ionicons name="videocam-outline" size={20} color="#A0A0A5" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View className="flex-1 bg-surface">
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#F4A261" />
            </View>
          ) : !messages || messages.length === 0 ? (
            <EmptyUI
              title="No messages yet"
              subtitle="Start the conversation!"
              iconName="chatbubbles-outline"
              iconColor="#6B6B70"
              iconSize={64}
            />
          ) : (
            <ScrollView
              ref={scrollViewRef}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
              onContentSizeChange={() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              }}
            >
              {messages.map((message) => {
                const isFromMe = currentUser ? message.senderId === currentUser._id : false;

                // sender pubkey for sig verify
                const senderPublicKey = isFromMe
                  ? (currentUser?.publicKey ?? null)
                  : participantPublicKey;

                return (
                  <MessageBubble
                    key={message._id}
                    message={message}
                    isFromMe={isFromMe}
                    senderPublicKeyPem={senderPublicKey}
                    myUserId={currentUser?._id ?? ""}
                  />
                );
              })}
            </ScrollView>
          )}

          {/* input */}
          <View className="px-3 pb-3 pt-2 bg-surface border-t border-surface-light">
            <View className="flex-row items-end bg-surface-card rounded-3xl px-3 py-1.5 gap-2">
              <Pressable className="w-8 h-8 rounded-full items-center justify-center">
                <Ionicons name="add" size={22} color="#F4A261" />
              </Pressable>

              <TextInput
                placeholder="Type a message"
                placeholderTextColor="#6B6B70"
                className="flex-1 text-foreground text-sm mb-2"
                multiline
                style={{ maxHeight: 100 }}
                value={messageText}
                onChangeText={handleTyping}
                onSubmitEditing={handleSend}
                editable={!isSending}
              />

              <Pressable
                className="w-8 h-8 rounded-full items-center justify-center bg-primary"
                onPress={handleSend}
                disabled={!messageText.trim() || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#0D0D0F" />
                ) : (
                  <Ionicons name="send" size={18} color="#0D0D0F" />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatDetailScreen;
