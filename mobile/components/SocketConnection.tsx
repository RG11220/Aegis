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
      // pass fn so token stays fresh on reconnect
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
