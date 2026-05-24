import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import useAuthSocial from "@/hooks/useSocialAuth";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedOrb } from "@/components/AnimatedOrb";
import { useRouter } from "expo-router";

const AuthScreen = () => {
  const { width, height } = useWindowDimensions();
  const { handleSocialAuth, loadingStrategy } = useAuthSocial();
  const router = useRouter();

  const isLoading = loadingStrategy !== null;

  return (
    <View className="flex-1 bg-surface-dark">
      {/* Animated background */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <LinearGradient
          colors={["#0a1a16", "#0d2b22", "#0a1a16", "#060f0c"]}
          style={{ position: "absolute", width: "100%", height: "100%" }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <AnimatedOrb colors={["#00876F", "#005a4a"]} size={300} initialX={-80} initialY={height * 0.1} duration={4000} />
        <AnimatedOrb colors={["#005a4a", "#00876F"]} size={250} initialX={width - 100} initialY={height * 0.3} duration={5000} />
        <AnimatedOrb colors={["#00c49a", "#00876F"]} size={200} initialX={width * 0.3} initialY={height * 0.6} duration={3500} />
        <AnimatedOrb colors={["#34d399", "#00876F"]} size={180} initialX={-50} initialY={height * 0.75} duration={4500} />
        <View style={{ position: "absolute", width: "100%", height: "100%", backgroundColor: "rgba(6,15,12,0.45)" }} />
      </View>

      <SafeAreaView className="flex-1">
        {/* Branding */}
        <View className="items-center pt-10">
          <Image
            source={require("../../assets/images/logo.png")}
            style={{ width: 100, height: 100, marginVertical: -20 }}
            contentFit="contain"
          />
          <Text className="text-4xl font-bold text-white tracking-wider uppercase">
            Aegis
          </Text>
        </View>

        {/* Hero */}
        <View className="flex-1 justify-center items-center px-6">
          <Image
            source={require("../../assets/images/auth.png")}
            style={{ width: width - 48, height: height * 0.28 }}
            contentFit="contain"
          />

          <View className="mt-6 items-center">
            <Text className="text-5xl font-bold text-white text-center">Connect & Chat</Text>
            <Text className="text-3xl font-bold mt-1" style={{ color: "#00876F" }}>Seamlessly</Text>
          </View>

          {/* Buttons */}
          <View className="w-full gap-3 mt-10">
            {/* Google */}
            <Pressable
              className="w-full flex-row items-center justify-center gap-3 bg-white py-4 rounded-2xl"
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              onPress={() => !isLoading && handleSocialAuth("oauth_google")}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              {loadingStrategy === "oauth_google" ? (
                <ActivityIndicator size="small" color="#1a1a1a" />
              ) : (
                <>
                  <Image
                    source={require("../../assets/images/google.png")}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                  />
                  <Text style={{ color: "#111", fontWeight: "600", fontSize: 15 }}>Continue with Google</Text>
                </>
              )}
            </Pressable>

            {/* Email / Password */}
            <Pressable
              className="w-full flex-row items-center justify-center gap-3 py-4 rounded-2xl border"
              style={({ pressed }) => ({
                backgroundColor: "rgba(0,135,111,0.15)",
                borderColor: "rgba(0,135,111,0.5)",
                opacity: pressed ? 0.85 : 1,
              })}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Continue with Email"
              onPress={() => router.push("/(auth)/sign-in")}
            >
              <Ionicons name="mail-outline" size={20} color="#00876F" />
              <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 15 }}>Continue with Email</Text>
            </Pressable>
          </View>

          <Text className="text-muted-foreground text-xs text-center mt-6 px-4">
            Don't have an account?{" "}
            <Pressable
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Sign up"
              onPress={() => router.push("/(auth)/sign-up")}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: "#00876F", fontWeight: "600" }}>Sign up</Text>
            </Pressable>
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default AuthScreen;
