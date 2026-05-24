import { useAuthCallback } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as Sentry from "@sentry/react-native";

const AuthSync = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { mutate: syncUser } = useAuthCallback();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!isLoaded) return; // wait for Clerk to finish loading

    if (isSignedIn && user && !hasSynced.current) {
      hasSynced.current = true;

      syncUser(undefined, {
        onSuccess: (data) => {
          console.log(" User synced with backend:", data.userName);
          Sentry.logger.info(Sentry.logger.fmt`User synced with backend: ${data.userName}`, {
            userId: user.id,
            userName: data.userName,
          });
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
    }
  }, [isLoaded, isSignedIn, user, syncUser]);

  return null;
};

export default AuthSync;
