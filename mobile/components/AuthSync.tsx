/**
 * AuthSync — backend user sync + socket lifecycle manager.
 *
 * Ordering guarantee:
 *   1. isSignedIn becomes true
 *   2. POST /auth/callback → user row is confirmed in SQL DB
 *   3. Socket connects (clerkId lookup in socket middleware now succeeds)
 *   4. On sign-out: socket disconnects, sync flag resets
 *
 * The socket must NOT connect before step 2 — the socket middleware does
 * SELECT WHERE clerkId = ? and will return "User not found" if authCallback
 * hasn't run yet.
 */

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

          // ✅ User is now confirmed in the SQL DB — safe to open the socket.
          connect(getToken, queryClient);
        },
        onError: (error) => {
          console.log("❌ User sync failed:", error);
          Sentry.logger.error("Failed to sync user with backend", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
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
