// set EXPO_PUBLIC_API_URL + EXPO_PUBLIC_SOCKET_URL in .env

export const API_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.0.1:3000") + "/api";

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://10.0.0.1:3000";
