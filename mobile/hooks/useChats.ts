import { useApi } from "@/lib/axios";
import type { Chat } from "@/types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const useChats = () => {
  const { apiWithAuth } = useApi();

  return useQuery({
    queryKey: ["chats"],
    queryFn: async () => {
      const { data } = await apiWithAuth<Chat[]>({ method: "GET", url: "/chats" });
      return data;
    },
  });
};

export const useGetOrCreateChat = () => {
  const { apiWithAuth } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantId: string) => {
      const { data } = await apiWithAuth<Chat>({
        method: "POST",
        url: `/chats/with/${participantId}`,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};

export const useCreateGroupChat = () => {
  const { apiWithAuth } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ participantIds, name }: { participantIds: string[]; name?: string }) => {
      const { data } = await apiWithAuth<Chat>({
        method: "POST",
        url: "/chats/group",
        data: { participantIds, name },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};

export const useUpdateGroupName = () => {
  const { apiWithAuth } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, name }: { chatId: string; name: string }) => {
      const { data } = await apiWithAuth<Chat>({
        method: "PATCH",
        url: `/chats/${chatId}`,
        data: { name },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};