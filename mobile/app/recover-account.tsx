// Forgot-password recovery (works while signed out). Flow:
//   1. Enter account email + 24 recovery words → Clerk emails a one-time code.
//   2. Enter the code + a new password → Clerk resets the password and signs you in.
//   3. The SAME keypair is re-derived from the seed and re-encrypted under the new
//      password (via /auth/recover-keys), so old messages stay readable.
// Lives at the root (not in (auth)) so it survives the signed-out → signed-in switch.

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSignIn } from "@clerk/clerk-expo";
import useKeyRecovery from "@/hooks/useKeyRecovery";
import { WORD_SET } from "@/lib/crypto/seed/SeedDictionary";

const WORD_COUNT = 24;
const COLUMNS = 3;
const ROWS = WORD_COUNT / COLUMNS;

const RecoverAccountScreen = () => {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { handleRecover, loading: recovering } = useKeyRecovery();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [words, setWords] = useState<string[]>(Array(WORD_COUNT).fill(""));
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const inputRefs = useRef<(TextInput | null)[]>(Array(WORD_COUNT).fill(null));
  const busyAll = busy || recovering;

  const updateWord = (i: number, v: string) => {
    const next = [...words];
    next[i] = v.toLowerCase().trim();
    setWords(next);
  };

  const allFilled = words.every((w) => w.length > 0);
  const allValid = words.every((w) => WORD_SET.has(w));

  // Step 1 → kick off Clerk's password-reset email
  const onSendCode = async () => {
    if (!isLoaded) return;
    setError("");
    if (!email.trim()) {
      setError("Enter your account email.");
      return;
    }
    const invalid = words.filter((w) => !WORD_SET.has(w));
    if (!allFilled || invalid.length > 0) {
      setError(
        invalid.length
          ? `Unknown word(s): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`
          : "Enter all 24 recovery words."
      );
      return;
    }

    setBusy(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      setStep(2);
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage ?? "Could not start recovery. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2 → verify code + set new password (Clerk), then re-key from the seed
  const onSubmit = async () => {
    if (!isLoaded || !setActive) return;
    setError("");
    if (code.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      setError("Password must be at least 8 characters and include letters and numbers.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });

      if (result.status !== "complete") {
        setError("Could not reset your password. Please try again.");
        return;
      }

      await setActive({ session: result.createdSessionId });

      // Signed in with the new password — re-derive the same keys and store them.
      const errMsg = await handleRecover(words, password);
      if (errMsg) {
        setError(errMsg);
        return;
      }

      Alert.alert(
        "Account recovered",
        "Your password was reset and your keys restored. You can read your messages again.",
        [{ text: "OK", onPress: () => router.replace("/(tabs)") }]
      );
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage ?? err?.message ?? "Recovery failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-dark">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <View className="px-6 pt-4">
          <TouchableOpacity
            onPress={() => (step === 2 ? setStep(1) : router.back())}
            className="w-10 h-10 rounded-full bg-surface-card items-center justify-center"
          >
            <Feather name="arrow-left" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="mt-6 mb-8">
            <View className="w-10 h-1 bg-primary-light rounded-full mb-4" />
            <Text className="text-white text-3xl font-bold">Recover{"\n"}Account</Text>
            <Text className="text-gray-500 mt-2 text-sm leading-5">
              {step === 1
                ? "Enter your email and 24 recovery words. We'll email you a code to confirm."
                : "Enter the code from your email and choose a new password."}
            </Text>
          </View>

          {step === 1 ? (
            <>
              <View className="mb-6">
                <Text className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest">Account Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#444"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-surface-card text-white rounded-2xl px-4 py-4 text-base border border-surface-light"
                />
              </View>

              <View className="mb-6">
                <Text className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-widest">Recovery Words</Text>
                {Array.from({ length: ROWS }).map((_, rowIdx) => (
                  <View key={rowIdx} className="flex-row gap-2 mb-2">
                    {Array.from({ length: COLUMNS }).map((_, colIdx) => {
                      const idx = rowIdx * COLUMNS + colIdx;
                      const w = words[idx] ?? "";
                      const invalid = w.length > 0 && !WORD_SET.has(w);
                      return (
                        <View key={idx} className="flex-1">
                          <Text className="text-gray-600 text-xs mb-1 text-center">{idx + 1}</Text>
                          <TextInput
                            ref={(el) => {
                              inputRefs.current[idx] = el;
                            }}
                            value={words[idx]}
                            onChangeText={(v) => updateWord(idx, v)}
                            placeholder="word"
                            placeholderTextColor="#444"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType={idx < WORD_COUNT - 1 ? "next" : "done"}
                            onSubmitEditing={() => inputRefs.current[idx + 1]?.focus()}
                            className="rounded-xl px-2 py-2 text-center text-sm"
                            style={{
                              backgroundColor: "#2a2a2e",
                              color: invalid ? "#f87171" : "#ffffff",
                              borderWidth: 1,
                              borderColor: invalid ? "#f87171" : "#333",
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {error ? (
                <View className="flex-row items-center gap-2 mb-4">
                  <Feather name="alert-circle" size={14} color="#f87171" />
                  <Text className="text-red-400 text-sm flex-1">{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={onSendCode}
                disabled={busyAll || !email || !allFilled || !allValid}
                activeOpacity={0.85}
                className="rounded-2xl py-4 items-center mb-12"
                style={{ backgroundColor: "#00876F", opacity: !email || !allFilled || !allValid ? 0.45 : 1 }}
              >
                {busyAll ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base tracking-wide">Send Code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View className="mb-5">
                <Text className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest">Verification Code</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="bg-surface-card text-white rounded-2xl px-4 py-4 text-base border border-surface-light text-center tracking-widest"
                />
              </View>

              <View className="mb-5">
                <Text className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest">New Password</Text>
                <View className="bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor="#444"
                    secureTextEntry={!showPassword}
                    className="flex-1 text-white py-4 text-base"
                  />
                  <TouchableOpacity onPress={() => setShowPassword((p) => !p)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#666" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-8">
                <Text className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest">Confirm Password</Text>
                <View className="bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light">
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="Re-enter password"
                    placeholderTextColor="#444"
                    secureTextEntry={!showPassword}
                    className="flex-1 text-white py-4 text-base"
                  />
                </View>
              </View>

              {error ? (
                <View className="flex-row items-center gap-2 mb-4">
                  <Feather name="alert-circle" size={14} color="#f87171" />
                  <Text className="text-red-400 text-sm flex-1">{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={onSubmit}
                disabled={busyAll || code.length < 6 || !password || !confirm}
                activeOpacity={0.85}
                className="rounded-2xl py-4 items-center mb-3"
                style={{ backgroundColor: "#00876F", opacity: code.length < 6 || !password || !confirm ? 0.45 : 1 }}
              >
                {busyAll ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base tracking-wide">Reset Password & Restore Keys</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onSendCode} disabled={busyAll} className="items-center py-1 mb-12">
                <Text className="text-gray-500 text-sm">
                  Didn't get it? <Text style={{ color: "#00876F" }} className="font-semibold">Resend code</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RecoverAccountScreen;
