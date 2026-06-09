// sync user to backend, then connect socket and restore crypto session

import { useAuthCallback } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useSocketStore } from "@/lib/socket";
import { useCryptoSession } from "@/lib/cryptoSession";
import { loadPersistedKeys } from "@/lib/cryptoSessionStorage";
import * as Sentry from "@sentry/react-native";

const AuthSync = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { mutate: syncUser } = useAuthCallback();
  const queryClient = useQueryClient();
  const connect = useSocketStore((s) => s.connect);
  const disconnect = useSocketStore((s) => s.disconnect);
  const setKeys = useCryptoSession((s) => s.setKeys);
  const privateKeyPem = useCryptoSession((s) => s.privateKeyPem);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user && !hasSynced.current) {
      hasSynced.current = true;
      syncUser(undefined, {
        onSuccess: async (data) => {
          console.log(" User synced with backend:", data.name);
          Sentry.logger.info(Sentry.logger.fmt`User synced: ${data.name}`, {
            userId: user.id,
            userName: data.name,
          });

          // refetch queries that ran before user row existed
          queryClient.invalidateQueries({ queryKey: ["chats"] });
          queryClient.invalidateQueries({ queryKey: ["users"] });

          connect(getToken, queryClient);

          // restore crypto session if it wasn't loaded by the sign-in flow
          // (happens on app restart when the user is already authenticated)
          if (!privateKeyPem) {
            const email = user.primaryEmailAddress?.emailAddress;
            if (email) {
              const persisted = await loadPersistedKeys(email);
              if (persisted) {
                setKeys(persisted.privateKeyPem, persisted.publicKeyPem);
              } else {
                console.warn("[CryptoStore] No persisted keys found for:", email);
              }
            }
          }
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
