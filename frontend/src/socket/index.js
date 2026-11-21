import { io } from "socket.io-client";
import { getStoredToken } from "../api/client";

/**
 * Resolves the Socket.IO server URL from VITE_SOCKET_URL,
 * or falls back to VITE_API_URL stripping trailing /api with a regex (Requirement 14).
 */
const resolveSocketUrl = () => {
  const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (rawSocketUrl && rawSocketUrl.trim()) {
    return rawSocketUrl.trim();
  }
  const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  return rawApiUrl.replace(/\/api\/?$/, "");
};

/**
 * Creates a Socket.IO client instance using auth callback to dynamically read current token (Requirement 4).
 * Never puts token in the query URL. Never logs tokens or payloads (Requirement 14).
 */
export const createNotificationSocket = () => {
  const socketUrl = resolveSocketUrl();

  return io(socketUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: (cb) => {
      const token = getStoredToken();
      cb({ token });
    },
  });
};