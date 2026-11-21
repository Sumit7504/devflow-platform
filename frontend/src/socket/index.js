import { io } from "socket.io-client";
import { getStoredToken } from "../api/client";

/**
 * Resolves the Socket.IO server URL strictly from VITE_SOCKET_URL or VITE_API_URL.
 * No addresses are hard-coded to localhost in the source code.
 */
const resolveSocketUrl = () => {
  const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (rawSocketUrl && rawSocketUrl.trim()) {
    return rawSocketUrl.trim();
  }
  const rawApiUrl = import.meta.env.VITE_API_URL;
  if (rawApiUrl && rawApiUrl.trim()) {
    return rawApiUrl.trim().replace(/\/api\/?$/, "");
  }
  return "";
};

/**
 * Creates a Socket.IO client instance using auth callback to dynamically read current token.
 * Never puts token in the query URL. Never logs tokens or payloads.
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
