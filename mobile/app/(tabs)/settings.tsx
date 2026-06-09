import { useAuth, useUser } from "@clerk/clerk-expo";
import { View, Text, ScrollView, Pressable, Alert, Modal, TextInput, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useAuthCallback } from "@/hooks/useAuth";
import { useCryptoSession } from "@/lib/cryptoSession";

const settings = () => {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const keyLoadFailed = useCryptoSession((s) => s.keyLoadFailed);

  const { mutateAsync: syncUser } = useAuthCallback();
  const queryClient = useQueryClient();

  const [isUploading, setIsUploading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const displayName = user?.username || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Anonymous";

  // Push the Clerk profile (username + picture) into the backend Users row so other
  // people see the change — everyone reads names/avatars from the server, not Clerk.
  const syncToBackend = async () => {
    try {
      await syncUser();
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      console.warn("[Settings] profile sync failed", e);
    }
  };

  const handleChangeProfilePhoto = async () => {
    if (isUploading || !user) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo access to change your picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setIsUploading(true);
      // Clerk accepts a Blob for the profile image; fetch the local file into one.
      const resp = await fetch(result.assets[0].uri);
      const blob = await resp.blob();
      await user.setProfileImage({ file: blob });
      await user.reload();
      await syncToBackend();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.errors?.[0]?.longMessage ?? e?.message ?? "Could not update photo.");
    } finally {
      setIsUploading(false);
    }
  };

  const openEdit = () => {
    setUsername(user?.username ?? "");
    setEditVisible(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    const next = username.trim();
    if (next.length < 4) {
      Alert.alert("Invalid username", "Username must be at least 4 characters.");
      return;
    }
    setSavingProfile(true);
    try {
      await user.update({ username: next });
      await user.reload();
      await syncToBackend();
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert("Update failed", e?.errors?.[0]?.longMessage ?? e?.message ?? "Could not update your username.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <ScrollView
      className="bg-surface-dark"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* header */}
      <View className="items-center mt-10">
        <View className="relative">
          <View className="rounded-full border-2 border-primary">
            <Image source={user?.imageUrl} style={{ width: 100, height: 100, borderRadius: 999 }} />
          </View>

          <Pressable
            onPress={handleChangeProfilePhoto}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            className="absolute bottom-1 right-1 w-8 h-8 bg-primary rounded-full items-center justify-center border-2 border-surface-dark"
            style={({ pressed }) => ({ opacity: pressed || isUploading ? 0.6 : 1 })}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#0D0D0F" />
            ) : (
              <Ionicons name="camera" size={16} color="#0D0D0F" />
            )}
          </Pressable>
        </View>

        <Text className="text-2xl font-bold text-foreground mt-4">{displayName}</Text>
        <Text className="text-muted-foreground mt-1">{user?.emailAddresses[0]?.emailAddress}</Text>

      </View>

      {/* key recovery warning */}
      {keyLoadFailed && (
        <Pressable
          onPress={() => router.push("/recover-account")}
          className="mx-5 mt-6 rounded-2xl overflow-hidden active:opacity-80"
          style={{ backgroundColor: "#002e26", borderWidth: 1, borderColor: "#00876F55" }}
        >
          <View className="flex-row items-center px-4 py-4 gap-3">
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: "#00876F22" }}>
              <Ionicons name="key-outline" size={20} color="#00876F" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold text-sm">Encryption keys not loaded</Text>
              <Text className="text-gray-400 text-xs mt-0.5 leading-4">
                Tap to recover with your 24-word seed phrase.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#00876F" />
          </View>
        </Pressable>
      )}

      {/* edit profile */}
      <View className="mt-6 mx-5">
        <View className="bg-surface-card rounded-2xl overflow-hidden">
          <Pressable
            onPress={openEdit}
            accessibilityRole="button"
            className="flex-row items-center px-4 py-3.5 active:bg-surface-light"
          >
            <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: "#00876F20" }}>
              <Ionicons name="person-outline" size={20} color="#00876F" />
            </View>
            <Text className="flex-1 ml-3 text-foreground font-medium">Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color="#6B6B70" />
          </Pressable>
        </View>
      </View>

      {/* logout */}
      <Pressable
        className="mx-5 mt-8 bg-red-500/10 rounded-2xl py-4 items-center active:opacity-70 border border-red-500/20"
        onPress={() => signOut()}
      >
        <View className="flex-row items-center">
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text className="ml-2 text-red-500 font-semibold">Log Out</Text>
        </View>
      </Pressable>

      {/* edit profile modal */}
      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: "#242428", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#2e2e32" }}>
            <Text style={{ color: "#F4F4F5", fontSize: 18, fontWeight: "700", marginBottom: 16 }}>Edit Profile</Text>

            <Text style={{ color: "#9a9aa0", fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Username
            </Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor="#6B6B70"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: "#1a1a1e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: "#F4F4F5", borderWidth: 1, borderColor: "#2e2e32", marginBottom: 20 }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setEditVisible(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#3a3a3e" }}
              >
                <Text style={{ color: "#cfcfd4", fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveProfile}
                disabled={savingProfile}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#00876F", opacity: savingProfile ? 0.6 : 1 }}
              >
                {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default settings;
