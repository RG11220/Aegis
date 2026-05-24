import { Stack } from "expo-router";
import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import AuthSync from "@/components/AuthSync";
import SocketConnection from "@/components/SocketConnection";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import * as Sentry from '@sentry/react-native';

// NativeWind 4 / react-native-css-interop wraps FlatList/VirtualizedList
// internally and produces a false-positive key warning. The keyExtractor on
// our FlatList is correct — this suppresses the library-level noise.
LogBox.ignoreLogs(["Each child in a list should have a unique"]);

Sentry.init({
  dsn: 'https://33c85c5153605087a4ca581c0f5356ca@o4511445146730496.ingest.de.sentry.io/4511445154267216',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration(),

    Sentry.reactNativeTracingIntegration({
      traceFetch: true,
      traceXHR: true,
      enableHTTPTimings: true,
    }),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});




const queryClient = new QueryClient();
export default Sentry.wrap(function RootLayout() {
  return (
    <ClerkProvider tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <AuthSync />
        <SocketConnection />
        <StatusBar style='light' />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#242428' } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="new-chat" options={{ animation: 'slide_from_bottom', presentation: 'modal', gestureEnabled: true }} />
        </Stack>
      </QueryClientProvider>
    </ClerkProvider>
  );
});