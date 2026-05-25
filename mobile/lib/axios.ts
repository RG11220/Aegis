import axios from "axios";
import * as Sentry from "@sentry/react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback } from "react";
import { API_URL } from "./config";

const isProduction = typeof __DEV__ === "boolean" ? !__DEV__ : process.env.NODE_ENV === "production";

const validateSecureUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Insecure API URL configured: only https:// is allowed in production.");
    }
  } catch (err) {
    throw new Error(`Invalid API URL: ${String(err)}`);
  }
};

if (isProduction) {
  validateSecureUrl(API_URL);
}

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

if (typeof process !== "undefined" && process.versions?.node) {
  try {
    const { Agent } = require("https");
    api.defaults.httpsAgent = new Agent({ rejectUnauthorized: true });
  } catch {
    // If https.Agent is unavailable, rely on the native transport's TLS enforcement.
  }
}

api.interceptors.request.use((config) => {
  const base = config.baseURL ?? API_URL;
  const resolvedUrl = new URL(config.url ?? "", base);
  if (isProduction && resolvedUrl.protocol !== "https:") {
    throw new Error(
      `Insecure request blocked: ${resolvedUrl.href} must use https:// in production.`
    );
  }
  return config;
});

// Response interceptor registered once
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      Sentry.logger.error(
        Sentry.logger
          .fmt`API request failed: ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        { status: error.response.status, endpoint: error.config?.url, method: error.config?.method }
      );
    } else if (error.request) {
      Sentry.logger.warn("API request failed - no response", {
        endpoint: error.config?.url,
        method: error.config?.method,
      });
    }
    return Promise.reject(error);
  }
);

export const useApi = () => {
  const { getToken } = useAuth();

  const apiWithAuth = useCallback(
    async <T>(config: Parameters<typeof api.request>[0]) => {
      const token = await getToken();
      return api.request<T>({
        ...config,
        headers: { ...config.headers, ...(token && { Authorization: `Bearer ${token}` }) },
      });
    },
    [getToken]
  );

  return { api, apiWithAuth };
};