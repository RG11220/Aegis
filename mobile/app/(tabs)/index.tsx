import ChatItem from "@/components/ChatItem";
import { EmptyUI } from "@/components/EmptyUI";
import { useChats } from "@/hooks/useChats";
import { Chat } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { Href, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

const ChatsTab = () => {
  const router = useRouter();
  const { data: chats, isLoading, error, refetch } = useChats();

  if (isLoading) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size={"large"} color={"#00876F"} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <Text className="text-red-500 text-3xl">Failed to load chats</Text>
        <Pressable onPress={() => refetch()} className="mt-4 px-4 py-2 bg-primary rounded-lg">
          <Text className="text-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const handleChatPress = (chat: Chat) => {
    if (chat.isGroup) {
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: chat._id,
          isGroup: "true",
          groupName: chat.name ?? "",
        },
      });
    } else {
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: chat._id,
          participantId: chat.participant!._id,
          name: chat.participant!.name,
          avatar: chat.participant!.avatar,
        },
      });
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={chats}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <ChatItem chat={item} onPress={() => handleChatPress(item)} />}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
        ListHeaderComponent={<Header />}
        ListEmptyComponent={
          <EmptyUI
            title="No chats yet"
            subtitle="Start a conversation!"
            iconName="chatbubbles-outline"
            iconColor="#6B6B70"
            iconSize={64}
            buttonLabel="New Chat"
            onPressButton={() => router.push("/new-chat" as Href)}
          />
        }
      />
    </View>
  );
};

export default ChatsTab;

function Header() {
  const router = useRouter();

  return (
    <View className="px-5 pt-2 pb-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">Chats</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            className="h-10 px-3 bg-surface-card rounded-full items-center justify-center flex-row gap-1.5 border border-surface-light"
            onPress={() => router.push("/new-group" as Href)}
          >
            <Ionicons name="people-outline" size={16} color="#00876F" />
            <Text className="text-primary text-sm font-medium">Group</Text>
          </Pressable>
          <Pressable
            className="size-10 bg-primary rounded-full items-center justify-center"
            onPress={() => router.push("/new-chat" as Href)}
          >
            <Ionicons name="create-outline" size={20} color="#0D0D0F" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
