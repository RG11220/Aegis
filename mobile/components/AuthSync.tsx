// sync user to backend, then connect socket

import { useAuthCallback } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useSocketStore } from "@/lib/socket";
import * as Sentry from "@sentry/react-native";

const AuthSync = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { mutate: syncUser } = useAuthCallback();
  const queryClient = useQueryClient();
  const connect = useSocketStore((s) => s.connect);
  const disconnect = useSocketStore((s) => s.disconnect);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user && !hasSynced.current) {
      hasSynced.current = true;
      syncUser(undefined, {
        onSuccess: (data) => {
          console.log(" User synced with backend:", data.name);
          Sentry.logger.info(Sentry.logger.fmt`User synced: ${data.name}`, {
            userId: user.id,
            userName: data.name,
          });

          // refetch queries that ran before user row existed
          queryClient.invalidateQueries({ queryKey: ["chats"] });
          queryClient.invalidateQueries({ queryKey: ["users"] });

          connect(getToken, queryClient);
        },
        onError: (error: any) => {
          const serverMessage = error?.response?.data?.message ?? error?.message ?? String(error);
          console.log("❌ User sync failed:", error?.response?.status, serverMessage);
          Sentry.logger.error("Failed to sync user with backend", {
            userId: user.id,
            error: serverMessage,
          });
        },
      });
    }

    if (!isSignedIn) {
      hasSynced.current = false;
      disconnect();
    }
  }, [isLoaded, isSignedIn, user, syncUser, connect, disconnect, getToken, queryClient]);

  return null;
};

export default AuthSync;
