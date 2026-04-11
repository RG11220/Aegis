import { Stack } from "expo-router";
import "../lobal.css";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";


const queryClient = new QueryClient();

export default function RootLayout() {
  return <QueryClientProvider client={queryClient}>
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  </QueryClientProvider>;
}
