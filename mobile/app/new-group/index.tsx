import UserItem from "@/components/UserItem";
import { useCreateGroupChat } from "@/hooks/useChats";
import { useUsers } from "@/hooks/useUsers";
import { useSocketStore } from "@/lib/socket";
import { User } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const NewGroupScreen = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  const { data: allUsers, isLoading } = useUsers();
  const { mutate: createGroup, isPending: isCreating } = useCreateGroupChat();
  const { onlineUsers } = useSocketStore();

  const users =
    allUsers?.filter((u) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        u.name?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)
      );
    }) ?? [];

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u._id === user._id)
        ? prev.filter((u) => u._id !== user._id)
        : [...prev, user]
    );
  };

  const handleCreate = () => {
    if (selectedUsers.length < 2) return;

    createGroup(
      {
        participantIds: selectedUsers.map((u) => u._id),
        name: groupName.trim() || undefined,
      },
      {
        onSuccess: (chat) => {
          router.dismiss();
          setTimeout(() => {
            router.push({
              pathname: "/chat/[id]",
              params: {
                id: chat._id,
                isGroup: "true",
                groupName: chat.name ?? "",
              },
            });
          }, 100);
        },
      }
    );
  };

  const canCreate = selectedUsers.length >= 2 && !isCreating;

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
              <Text className="text-foreground text-xl font-semibold">New group</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Select at least 2 people
              </Text>
            </View>
            <Pressable
              onPress={handleCreate}
              disabled={!canCreate}
              className={`px-4 py-2 rounded-full ${canCreate ? "bg-primary-light" : "bg-surface-card"}`}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  className={`text-sm font-semibold ${canCreate ? "text-white" : "text-muted-foreground"}`}
                >
                  Create
                </Text>
              )}
            </Pressable>
          </View>

          {/* group name */}
          <View className="px-5 pt-4 pb-3 bg-surface border-b border-surface-light">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-2">
              Group Name
            </Text>
            <View className="flex-row items-center bg-surface-card rounded-2xl px-4 py-1 gap-3 border border-surface-light">
              <Ionicons name="people-outline" size={18} color="#00876F" />
              <TextInput
                placeholder="Enter a group name…"
                placeholderTextColor="#6B6B70"
                className="flex-1 text-foreground text-base"
                style={{ paddingVertical: 10 }}
                value={groupName}
                onChangeText={setGroupName}
                returnKeyType="done"
              />
              {groupName.length > 0 && (
                <Pressable onPress={() => setGroupName("")}>
                  <Ionicons name="close-circle" size={18} color="#6B6B70" />
                </Pressable>
              )}
            </View>
          </View>

          {/* selected chips */}
          {selectedUsers.length > 0 && (
            <View className="px-5 pt-2 pb-1 flex-row flex-wrap gap-2">
              {selectedUsers.map((u) => (
                <Pressable
                  key={u._id}
                  onPress={() => toggleUser(u)}
                  className="flex-row items-center bg-primary/20 rounded-full px-3 py-1 gap-1"
                >
                  <Text className="text-primary text-xs font-medium">{u.name}</Text>
                  <Ionicons name="close-circle" size={14} color="#00876F" />
                </Pressable>
              ))}
            </View>
          )}

          {/* search */}
          <View className="px-5 pt-2 pb-2 bg-surface">
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
            {isLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#00876F" />
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const isSelected = selectedUsers.some((u) => u._id === item._id);
                  return (
                    <View className="flex-row items-center px-5">
                      <View
                        className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-surface-light"
                        }`}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark" size={14} color="#0D0D0F" />
                        )}
                      </View>
                      <View className="flex-1">
                        <UserItem
                          user={item}
                          isOnline={onlineUsers.has(item._id)}
                          onPress={() => toggleUser(item)}
                        />
                      </View>
                    </View>
                  );
                }}
                ListHeaderComponent={
                  users.length > 0 ? (
                    <Text className="text-muted-foreground text-xs mb-3 px-5">USERS</Text>
                  ) : null
                }
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center px-5 pt-20">
                    <Ionicons name="person-outline" size={64} color="#6B6B70" />
                    <Text className="text-muted-foreground text-lg mt-4">No users found</Text>
                  </View>
                }
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
};

export default NewGroupScreen;
