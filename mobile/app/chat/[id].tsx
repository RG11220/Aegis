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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChats, useUpdateGroupName } from "@/hooks/useChats";
import type { Chat, MessageSender } from "@/types";
import { useCryptoSession } from "@/lib/cryptoSession";

type ChatParams = {
  id: string;
  // DM params
  participantId?: string;
  name?: string;
  avatar?: string;
  // Group params
  isGroup?: string;
  groupName?: string;
};

const ChatDetailScreen = () => {
  const { id: chatId, avatar, name, participantId, isGroup: isGroupParam, groupName } =
    useLocalSearchParams<ChatParams>();

  const isGroup = isGroupParam === "true";

  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const { data: currentUser } = useCurrentUser();
  const { publicKeyPem: myPublicKeyPemFromSession } = useCryptoSession();
  // prefer the session key (guaranteed in sync with signing key); fall back to DB value
  const myPublicKeyPem = myPublicKeyPemFromSession ?? currentUser?.publicKey ?? null;
  const { data: messages, isLoading } = useMessages(chatId);

  const { joinChat, leaveChat, sendMessage, sendTyping, isConnected, onlineUsers, typingUsers } =
    useSocketStore();
  const { mutateAsync: updateGroupName } = useUpdateGroupName();

  // --- DM-only helpers ---
  const isOnline = !isGroup && participantId ? onlineUsers.has(participantId) : false;
  const isTyping = isGroup
    ? !!typingUsers.get(chatId)
    : typingUsers.get(chatId) === participantId;

  // --- Get participants from cache (reactive — re-renders when public keys arrive) ---
  const { data: chats } = useChats();
  const cachedChat = useMemo(() => chats?.find((c) => c._id === chatId), [chatId, chats]);

  // DM: single participant pubkey
  const participantPublicKey = useMemo(() => {
    if (isGroup) return null;
    return cachedChat?.participant?.publicKey ?? null;
  }, [isGroup, cachedChat]);

  // Group: map userId → publicKey for all participants
  const participantsKeyMap = useMemo((): Map<string, string> => {
    if (!isGroup) return new Map();
    const map = new Map<string, string>();
    for (const p of cachedChat?.participants ?? []) {
      if (p.publicKey) map.set(p._id, p.publicKey);
    }
    // always use the crypto-session public key for self — it's guaranteed to match the signing key
    if (currentUser?._id && myPublicKeyPem) map.set(currentUser._id, myPublicKeyPem);
    return map;
  }, [isGroup, cachedChat, currentUser]);

  // Group display name
  const displayName = isGroup
    ? (groupName || cachedChat?.name || "Group Chat")
    : (name ?? "");

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => sendTyping(chatId, false), 2000);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendTyping(chatId, false);
      }
    },
    [chatId, isConnected, sendTyping]
  );

  const handleSend = async () => {
    if (!messageText.trim() || isSending || !isConnected || !currentUser) {
      console.log("[Send] blocked:", { hasText: !!messageText.trim(), isSending, isConnected, hasUser: !!currentUser });
      return;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(chatId, false);

    let recipients: { userId: string; publicKeyPem: string }[];

    if (isGroup) {
      // All participants (including self) must have a key slot
      recipients = Array.from(participantsKeyMap.entries()).map(([userId, publicKeyPem]) => ({
        userId,
        publicKeyPem,
      }));

      if (recipients.length < 2) {
        Alert.alert(
          "Can't send yet",
          "Participant encryption keys are not yet available. Please wait."
        );
        return;
      }
    } else {
      if (!participantPublicKey || !participantId || !myPublicKeyPem) {
        Alert.alert(
          "Can't send yet",
          "Encryption keys are not yet available. Please wait."
        );
        return;
      }
      recipients = [
        { userId: currentUser._id, publicKeyPem: myPublicKeyPem! },
        { userId: participantId, publicKeyPem: participantPublicKey },
      ].filter((r): r is { userId: string; publicKeyPem: string } => Boolean(r.publicKeyPem));

      if (recipients.length < 2) {
        Alert.alert(
          "Can't send yet",
          "Both participants need valid encryption keys before messages can be sent."
        );
        return;
      }
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
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (sendError: any) {
      Alert.alert("Send failed", sendError?.message ?? "Message failed to send.");
    } finally {
      setIsSending(false);
    }
  };

  const openGroupInfo = () => {
    setGroupNameInput(cachedChat?.name ?? "");
    setShowGroupInfo(true);
  };

  const handleSaveGroupName = async () => {
    const trimmed = groupNameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      await updateGroupName({ chatId, name: trimmed });
      setShowGroupInfo(false);
    } catch {
      Alert.alert("Error", "Could not update group name.");
    } finally {
      setSavingName(false);
    }
  };

  // Resolve sender pubkey for a given message (needed for sig verify in MessageBubble)
  const getSenderPublicKey = (senderId: string): string | null => {
    if (isGroup) {
      return participantsKeyMap.get(senderId) ?? null;
    }
    const isFromMe = senderId === currentUser?._id;
    const key = isFromMe ? (myPublicKeyPem ?? null) : participantPublicKey;
    console.log(
      "[SigDebug] senderId:", senderId,
      "| currentUser._id:", currentUser?._id,
      "| isFromMe:", isFromMe,
      "| keyPrefix:", key?.slice(0, 40) ?? "NULL"
    );
    return key;
  };

  return (
    <>
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      {/* header */}
      <View className="flex-row items-center px-4 py-2 bg-surface border-b border-surface-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={24} color="#00876F" />
        </Pressable>
        <Pressable
          className="flex-row items-center flex-1 ml-2"
          onPress={() => isGroup && openGroupInfo()}
          disabled={!isGroup}
        >
          {isGroup ? (
            <View className="w-10 h-10 rounded-full bg-surface-card items-center justify-center border border-surface-light">
              <Ionicons name="people" size={20} color="#6B6B70" />
            </View>
          ) : (
            avatar && <Image source={avatar} style={{ width: 40, height: 40, borderRadius: 999 }} />
          )}
          <View className="ml-3 flex-1">
            <View className="flex-row items-center gap-1">
              <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
                {displayName}
              </Text>
              {isGroup && <Ionicons name="chevron-down" size={14} color="#6B6B70" />}
            </View>
            {isGroup ? (
              <Text className={`text-xs ${isTyping ? "text-primary" : "text-muted-foreground"}`}>
                {isTyping
                  ? "typing..."
                  : `${(cachedChat?.participants?.length ?? 0) + 1} members`}
              </Text>
            ) : (
              <Text className={`text-xs ${isTyping ? "text-primary" : "text-muted-foreground"}`}>
                {isTyping ? "typing..." : isOnline ? "Online" : "Offline"}
              </Text>
            )}
          </View>
        </Pressable>
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
              <ActivityIndicator size="large" color="#00876F" />
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
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((message) => {
                const isFromMe = currentUser ? message.senderId === currentUser._id : false;
                const senderPublicKey = getSenderPublicKey(message.senderId);

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
                <Ionicons name="add" size={22} color="#00876F" />
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
                className="w-10 h-10 rounded-full items-center justify-center bg-primary-light"
                onPress={handleSend}
                disabled={!messageText.trim() || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="send" size={18} color="#ffffff" />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Group Info Sheet */}
      <Modal
        visible={showGroupInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupInfo(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          onPress={() => setShowGroupInfo(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: "#1A1A1D", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 32 }}
          >
            {/* handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#3a3a3e" }} />
            </View>

            {/* header row */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#2D2D30" }}>
              <Text style={{ flex: 1, color: "#F4F4F5", fontSize: 18, fontWeight: "700" }}>Group Info</Text>
              <Pressable onPress={() => setShowGroupInfo(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#242428", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* group name edit */}
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Group Name
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#242428", borderRadius: 14, borderWidth: 1, borderColor: "#2D2D30", paddingHorizontal: 14, paddingVertical: 4, gap: 8 }}>
                  <TextInput
                    value={groupNameInput}
                    onChangeText={setGroupNameInput}
                    placeholder="Enter group name…"
                    placeholderTextColor="#6B6B70"
                    autoCorrect={false}
                    style={{ flex: 1, color: "#F4F4F5", fontSize: 15, paddingVertical: 10 }}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveGroupName}
                  />
                  {groupNameInput.trim().length > 0 && (
                    <Pressable
                      onPress={handleSaveGroupName}
                      disabled={savingName}
                      style={{ backgroundColor: "#00876F", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      {savingName
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Save</Text>
                      }
                    </Pressable>
                  )}
                </View>
              </View>

              {/* member list */}
              <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                  Members · {(cachedChat?.participants?.length ?? 0) + 1}
                </Text>

                {/* current user */}
                {currentUser && (
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}>
                    <Image source={currentUser.avatar} style={{ width: 42, height: 42, borderRadius: 999 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#F4F4F5", fontWeight: "600", fontSize: 14 }}>{currentUser.name}</Text>
                      <Text style={{ color: "#6B6B70", fontSize: 12 }}>You</Text>
                    </View>
                  </View>
                )}

                {/* other participants */}
                {(cachedChat?.participants ?? []).map((p) => (
                  <View key={p._id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}>
                    <Image source={p.avatar} style={{ width: 42, height: 42, borderRadius: 999 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#F4F4F5", fontWeight: "600", fontSize: 14 }}>{p.name}</Text>
                      <Text style={{ color: "#6B6B70", fontSize: 12 }}>{p.email}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
    </>
  );
};

export default ChatDetailScreen;
