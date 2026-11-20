import axios from "axios";

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

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor: Attach Bearer Token ──────────────────────────────────
client.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: Auto-logout on 401 / Account Deactivated 403 ───────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || "";

    // Skip /auth/login and /auth/register so credentials & validation errors
    // are passed directly to the calling component to show to the user
    const isAuthEndpoint =
      url.includes("/auth/login") || url.includes("/auth/register");

    if (!isAuthEndpoint && error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || "";

      const isUnauthorized = status === 401;
      const isDeactivated =
        status === 403 && message.toLowerCase().includes("deactivated");

      if (isUnauthorized || isDeactivated) {
        clearStoredToken();
        // Redirect to login only if not already there
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
