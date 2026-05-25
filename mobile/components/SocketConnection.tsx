import { useSocketStore, SocketState } from "@/lib/socket";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const SocketConnection = () => {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const connect = useSocketStore((state: SocketState) => state.connect);
  const disconnect = useSocketStore((state: SocketState) => state.disconnect);

  useEffect(() => {
    if (isSignedIn) {
      // Pass getToken as a function — socket.io calls it on every connect/reconnect
      // so the Clerk JWT is always fresh (short-lived tokens never expire mid-session).
      connect(getToken, queryClient);
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isSignedIn, connect, disconnect, getToken, queryClient]);

  return null;
};

export default SocketConnection;
