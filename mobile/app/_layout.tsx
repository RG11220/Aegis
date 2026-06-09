// must be first — polyfills crypto.getRandomValues for Hermes
import "react-native-get-random-values";
import { Stack } from "expo-router";
import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import AuthSync from "@/components/AuthSync";
import CryptoUnlockModal from "@/components/CryptoUnlockModal";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import * as Sentry from '@sentry/react-native';

// suppress false-positive key warning from NativeWind FlatList wrapping
LogBox.ignoreLogs(["Each child in a list should have a unique"]);

Sentry.init({
  dsn: 'https://33c85c5153605087a4ca581c0f5356ca@o4511445146730496.ingest.de.sentry.io/4511445154267216',

  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration(),

    Sentry.reactNativeTracingIntegration({
      traceFetch: true,
      traceXHR: true,
      enableHTTPTimings: true,
    }),
  ],

  // spotlight: __DEV__, // uncomment for Spotlight
});




const queryClient = new QueryClient();
export default Sentry.wrap(function RootLayout() {
  return (
    <ClerkProvider tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <AuthSync />
        <StatusBar style='light' />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#242428' } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="new-chat" options={{ animation: 'slide_from_bottom', presentation: 'modal', gestureEnabled: true }} />
          <Stack.Screen name="recover"  options={{ animation: 'slide_from_bottom', presentation: 'modal', gestureEnabled: true }} />
        </Stack>
        <CryptoUnlockModal />
      </QueryClientProvider>
    </ClerkProvider>
  );
});