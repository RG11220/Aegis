import { Chat } from "@/types";
import { Image } from "expo-image";
import { View, Text, Pressable } from "react-native";
import { formatDistanceToNow } from "date-fns";
import { useSocketStore } from "@/lib/socket";
import { Ionicons } from "@expo/vector-icons";

const ChatItem = ({ chat, onPress }: { chat: Chat; onPress: () => void }) => {
  const { onlineUsers, typingUsers, unreadChats } = useSocketStore();

  const hasUnread = unreadChats.has(chat._id);

  if (chat.isGroup) {
    const participants = chat.participants ?? [];
    const isTyping = !!typingUsers.get(chat._id);
    const displayName = chat.name || participants.map((p) => p.name).join(", ");

    return (
      <Pressable className="flex-row items-center py-3 active:opacity-70" onPress={onPress}>
        {/* group icon */}
        <View className="w-14 h-14 rounded-full bg-surface-card items-center justify-center border border-surface-light">
          <Ionicons name="people" size={26} color="#6B6B70" />
        </View>

        {/* info */}
        <View className="flex-1 ml-4">
          <View className="flex-row items-center justify-between">
            <Text
              className={`text-base font-medium flex-1 mr-2 ${hasUnread ? "text-primary" : "text-foreground"}`}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <View className="flex-row items-center gap-2">
              {hasUnread && <View className="w-2.5 h-2.5 bg-primary rounded-full" />}
              <Text className="text-xs text-subtle-foreground">
                {chat.lastMessageAt
                  ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false })
                  : ""}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between mt-1">
            {isTyping ? (
              <Text className="text-sm text-primary italic">typing...</Text>
            ) : (
              <Text
                className={`text-sm flex-1 mr-3 ${hasUnread ? "text-foreground font-medium" : "text-subtle-foreground"}`}
                numberOfLines={1}
              >
                {chat.lastMessage
                  ? (chat.lastMessage.text ?? "🔒 New message")
                  : "No messages yet"}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  // DM
  const participant = chat.participant;
  if (!participant) return null;

  const isOnline = onlineUsers.has(participant._id);
  const isTyping = typingUsers.get(chat._id) === participant._id;

  return (
    <Pressable className="flex-row items-center py-3 active:opacity-70" onPress={onPress}>
      {/* avatar */}
      <View className="relative">
        <Image source={participant.avatar} style={{ width: 56, height: 56, borderRadius: 999 }} />
        {isOnline && (
          <View className="absolute bottom-0 right-0 size-4 bg-green-500 rounded-full border-[3px] border-surface" />
        )}
      </View>

      {/* info */}
      <View className="flex-1 ml-4">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-base font-medium ${hasUnread ? "text-primary" : "text-foreground"}`}
          >
            {participant.name}
          </Text>

          <View className="flex-row items-center gap-2">
            {hasUnread && <View className="w-2.5 h-2.5 bg-primary rounded-full" />}
            <Text className="text-xs text-subtle-foreground">
              {chat.lastMessageAt
                ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false })
                : ""}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-1">
          {isTyping ? (
            <Text className="text-sm text-primary italic">typing...</Text>
          ) : (
            <Text
              className={`text-sm flex-1 mr-3 ${hasUnread ? "text-foreground font-medium" : "text-subtle-foreground"}`}
              numberOfLines={1}
            >
              {chat.lastMessage
                ? (chat.lastMessage.text ?? "🔒 New message")
                : "No messages yet"}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
};
export default ChatItem;
