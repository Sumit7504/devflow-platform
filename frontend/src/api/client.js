import axios from "axios";
import { setWakingState, clearWakingState } from "../services/wakingState";

// Single constant for the authentication token key in localStorage
export const TOKEN_STORAGE_KEY = "devflow_auth_token";

export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    return null;
  }
};

export const setStoredToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    // Storage access restricted (private browsing / disabled cookies)
  }
};

export const clearStoredToken = () => {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    // Storage access restricted
  }
};

// API base address comes only from VITE_API_URL (no hard-coded localhost in source)
const rawApiUrl = import.meta.env.VITE_API_URL;

export const API_CONFIG_ERROR =
  !rawApiUrl || !rawApiUrl.trim()
    ? (import.meta.env.PROD
        ? "Configuration error: VITE_API_URL is missing. Please configure VITE_API_URL in your deployment environment."
        : "Configuration error: VITE_API_URL is missing. Please define VITE_API_URL in your frontend .env file.")
    : null;

const client = axios.create({
  baseURL: rawApiUrl ? rawApiUrl.trim() : "",
  timeout: 70000, // 70 seconds timeout for Render cold starts
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor: Attach Bearer Token & Start Waking Timer ──────────────
client.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Start a 4-second waking timer for GET requests after a quiet period
    const method = (config.method || "get").toLowerCase();
    if (method === "get") {
      config.__wakingTimer = setTimeout(() => {
        setWakingState({
          isWaking: true,
          message: "The server may be waking up, this can take up to a minute",
          retryHandler: () => client(config),
        });
      }, 4000);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: Waking Recovery, Auto-Retry, & Auto-Logout ──────────
client.interceptors.response.use(
  (response) => {
    if (response.config?.__wakingTimer) {
      clearTimeout(response.config.__wakingTimer);
    }
    clearWakingState();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (originalRequest?.__wakingTimer) {
      clearTimeout(originalRequest.__wakingTimer);
    }

    // Check if error qualifies for waking banner (network error, timeout, 502, 503, 504)
    const isNetworkError = !error.response;
    const isTimeout = error.code === "ECONNABORTED" || error.message?.includes("timeout");
    const status = error.response?.status;
    const isWakingStatus = status === 502 || status === 503 || status === 504;

    if (isNetworkError || isTimeout || isWakingStatus) {
      setWakingState({
        isWaking: true,
        message: "The server may be waking up, this can take up to a minute",
        retryHandler: () => client(originalRequest),
      });

      // Auto-retry ONLY for GET requests with backoff; NEVER auto-retry mutations
      const method = (originalRequest?.method || "get").toLowerCase();
      if (originalRequest && method === "get") {
        originalRequest.__retryCount = (originalRequest.__retryCount || 0) + 1;
        if (originalRequest.__retryCount <= 3) {
          const delayMs = originalRequest.__retryCount * 2000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return client(originalRequest);
        }
      }
    }

    // Authentication & Deactivation Interception
    const url = originalRequest?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") || url.includes("/auth/register");

    if (!isAuthEndpoint && error.response) {
      const respStatus = error.response.status;
      const message = error.response.data?.message || "";

      const isUnauthorized = respStatus === 401;
      const isDeactivated =
        respStatus === 403 && message.toLowerCase().includes("deactivated");

      if (isUnauthorized || isDeactivated) {
        clearStoredToken();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
