import { useApi } from "../lib/axios";
import { useMutation } from "@tanstack/react-query";

export interface SyncedUser {
    userID: number;
    userName: string;
    userEmail: string;
    profilePicture: string;
}

export const useAuthCallback = () => {

    const { apiWithAuth } = useApi();

    const result = useMutation({
        mutationFn: async (): Promise<SyncedUser> => {
            const { data } = await apiWithAuth<SyncedUser>({
                method: 'POST',
                url: '/auth/callback',
            });
            return data;
        },
    });

    return result;
};