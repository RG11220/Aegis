import { useApi } from "@/lib/axios";
import type { Message } from "@/types";
import { useQuery } from "@tanstack/react-query";

export const useMessages = (chatId: string) => {
  const { apiWithAuth } = useApi();

  return useQuery({
    queryKey: ["messages", chatId],
    queryFn: async () => {
      const { data } = await apiWithAuth<Message[]>({
        method: "GET",
        url: `/messages/chat/${chatId}`,
      });
      return data;
    },
    enabled: !!chatId,
  });
};
