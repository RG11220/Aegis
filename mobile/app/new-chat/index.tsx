import UserItem from "@/components/UserItem";
import { useGetOrCreateChat } from "@/hooks/useChats";
import { useUsers } from "@/hooks/useUsers";
import { useSocketStore } from "@/lib/socket";
import { User } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const NewChatScreen = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allUsers, isLoading } = useUsers();
  const { mutate: getOrCreateChat, isPending: isCreatingChat } = useGetOrCreateChat();
  const { onlineUsers } = useSocketStore();

  const users = allUsers?.filter((u) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query);
  }) ?? [];

  const handleUserSelect = (user: User) => {
    getOrCreateChat(user._id, {
      onSuccess: (chat) => {
        router.dismiss();
        setTimeout(() => {
          router.push({
            pathname: "/chat/[id]",
            params: {
              id: chat._id,
              participantId: chat.participant._id,
              name: chat.participant.name,
              avatar: chat.participant.avatar,
            },
          });
        }, 100);
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top"]}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-surface rounded-t-3xl h-[95%] overflow-hidden">

          {/* header */}
          <View className="px-5 pt-3 pb-3 bg-surface border-b border-surface-light flex-row items-center">
            <Pressable
              className="w-9 h-9 rounded-full items-center justify-center mr-2 bg-surface-card"
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={20} color="#00876F" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-foreground text-xl font-semibold">New chat</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Search for a user to start chatting
              </Text>
            </View>
          </View>

          {/* search */}
          <View className="px-5 pt-3 pb-2 bg-surface">
            <View className="flex-row items-center bg-surface-card rounded-full px-3 py-1.5 gap-2 border border-surface-light">
              <Ionicons name="search" size={18} color="#6B6B70" />
              <TextInput
                placeholder="Search users"
                placeholderTextColor="#6B6B70"
                className="flex-1 text-foreground text-sm"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* users */}
          <View className="flex-1 bg-surface">
            {isCreatingChat || isLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#00876F" />
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <UserItem
                    user={item}
                    isOnline={onlineUsers.has(item._id)}
                    onPress={() => handleUserSelect(item)}
                  />
                )}
                ListHeaderComponent={
                  users.length > 0
                    ? <Text className="text-muted-foreground text-xs mb-3">USERS</Text>
                    : null
                }
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center px-5 pt-20">
                    <Ionicons name="person-outline" size={64} color="#6B6B70" />
                    <Text className="text-muted-foreground text-lg mt-4">No users found</Text>
                    <Text className="text-subtle-foreground text-sm mt-1 text-center">
                      Try a different search term
                    </Text>
                  </View>
                }
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
};

export default NewChatScreen;
