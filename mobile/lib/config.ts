/**
 * Central client configuration.
 * Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_SOCKET_URL in your .env file.
 * Both default to the local dev server so the app works out of the box on
 * the same machine. Change the env vars for staging / production builds.
 */

export const API_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.0.1:3000") + "/api";

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://10.0.0.1:3000";
