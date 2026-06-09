// Shown when the user is authenticated but crypto keys are not in session.
// Prompts for password to decrypt existing keys, or to set a password for new ones.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCryptoUnlock } from "@/hooks/useCryptoUnlock";
import { useCryptoSession } from "@/lib/cryptoSession";
import { useApi } from "@/lib/axios";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter, useSegments } from "expo-router";

const CryptoUnlockModal = () => {
  const privateKeyPem = useCryptoSession((s) => s.privateKeyPem);
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExistingKeys, setHasExistingKeys] = useState<boolean | null>(null);

  const { unlock, loading } = useCryptoUnlock();
  const { apiWithAuth } = useApi();

  const checkKeys = async () => {
    if (hasExistingKeys !== null) return;
    try {
      await apiWithAuth({ method: "GET", url: "/auth/crypto-keys" });
      setHasExistingKeys(true);
    } catch (err: any) {
      setHasExistingKeys(err?.response?.status === 404 ? false : true);
    }
  };

  // Only prompt on authenticated in-app screens; never cover the auth flow
  // or the seed-phrase recovery screen (the escape hatch when you can't unlock).
  const inAuthGroup = segments[0] === "(auth)";
  const onRecover = segments.includes("recover-account");
  const visible = isLoaded && !!isSignedIn && !privateKeyPem && !inAuthGroup && !onRecover;
  if (!visible) return null;

  const isNewUser = hasExistingKeys === false;
  const title = isNewUser ? "Secure Your Messages" : "Unlock Your Messages";
  const subtitle = isNewUser
    ? "Set a password to encrypt your private key. You'll need this to access your messages on new devices."
    : "Enter your password to decrypt your encryption keys.";

  const handleSubmit = async () => {
    setError(null);
    if (isNewUser && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const err = await unlock(password);
    if (err) setError(err);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onShow={checkKeys}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <View style={{ width: "100%", backgroundColor: "#242428", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#2e2e32" }}>
            {/* Icon */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#1a1a1e", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2e2e32" }}>
                <Ionicons name="lock-closed" size={26} color="#F4A261" />
              </View>
            </View>

            <Text style={{ color: "#F4F4F5", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
              {title}
            </Text>
            <Text style={{ color: "#9a9aa0", fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
              {subtitle}
            </Text>

            {/* Password field */}
            <View style={{ backgroundColor: "#1a1a1e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#2e2e32", marginBottom: 12 }}>
              <TextInput
                placeholder={isNewUser ? "Create a password" : "Your password"}
                placeholderTextColor="#6B6B70"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={{ flex: 1, color: "#F4F4F5", fontSize: 15 }}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={checkKeys}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B6B70" />
              </Pressable>
            </View>

            {/* Confirm field — only for new users */}
            {isNewUser && (
              <View style={{ backgroundColor: "#1a1a1e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#2e2e32", marginBottom: 12 }}>
                <TextInput
                  placeholder="Confirm password"
                  placeholderTextColor="#6B6B70"
                  secureTextEntry={!showPassword}
                  value={confirm}
                  onChangeText={setConfirm}
                  style={{ flex: 1, color: "#F4F4F5", fontSize: 15 }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            {/* Error */}
            {error && (
              <Text style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
                {error}
              </Text>
            )}

            {/* Submit */}
            <Pressable
              style={{ backgroundColor: "#F4A261", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0D0D0F" />
              ) : (
                <Text style={{ color: "#0D0D0F", fontWeight: "600", fontSize: 16 }}>
                  {isNewUser ? "Set Password & Continue" : "Unlock"}
                </Text>
              )}
            </Pressable>

            {/* Recovery escape hatch — a forgotten password or key mismatch must not be
                a dead end. Navigating to /recover-account hides this modal (see visibility guard). */}
            {!isNewUser && (
              <Pressable
                onPress={() => router.push("/recover-account")}
                style={{ paddingVertical: 12, alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ color: "#F4A261", fontSize: 14, fontWeight: "600" }}>
                  Forgot password? Recover with seed phrase
                </Text>
              </Pressable>
            )}

            {hasExistingKeys === null && (
              <Text style={{ color: "#6B6B70", fontSize: 12, textAlign: "center", marginTop: 12 }}>
                Checking your account…
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default CryptoUnlockModal;
