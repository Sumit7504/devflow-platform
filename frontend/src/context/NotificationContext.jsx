import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import client from "../api/client";
import { useAuth } from "./AuthContext";
import { createNotificationSocket } from "../socket";
import { getErrorMessage } from "../utils/formatters";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  // Notifications only apply to candidates and recruiters (not admins)
  const shouldConnect = Boolean(
    isAuthenticated && user && (user.role === "candidate" || user.role === "recruiter")
  );

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("offline"); // "connected" | "reconnecting" | "offline"

  // Live toasts for incoming socket events (Requirement 8)
  const [toasts, setToasts] = useState([]);

  // Version counter incremented on live socket events for page 1 synchronization (Requirement 9)
  const [version, setVersion] = useState(0);

  const socketRef = useRef(null);
  const hasConnectedOnceRef = useRef(false);

  // Requirement 2: Merge helper by _id
  const mergeNotifications = (existing, incoming) => {
    const map = new Map();
    incoming.forEach((n) => {
      if (n && n._id) map.set(n._id, n);
    });
    existing.forEach((n) => {
      if (n && n._id && !map.has(n._id)) {
        map.set(n._id, n);
      }
    });
    return Array.from(map.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
  };

  // Fetch unread count from server
  const fetchUnreadCount = async () => {
    try {
      const res = await client.get("/notifications/unread-count");
      if (res.data?.success && typeof res.data.count === "number") {
        setUnreadCount(res.data.count);
      }
    } catch (err) {
      // Ignore canceled errors
    }
  };

  // Fetch top 10 notifications for the dropdown
  const fetchTopNotifications = async () => {
    try {
      const res = await client.get("/notifications?page=1&limit=10");
      if (res.data?.success && Array.isArray(res.data.notifications)) {
        setNotifications((prev) => mergeNotifications(prev, res.data.notifications));
      }
    } catch (err) {
      // Ignore canceled errors
    }
  };

  // Reconcile unread count and latest notifications after reconnect (Requirement 1, 2 & 5)
  const reconcileAfterReconnect = async () => {
    await Promise.all([fetchUnreadCount(), fetchTopNotifications()]);
  };

  // Requirement 7: Reset all notification state on logout or user change
  useEffect(() => {
    if (!shouldConnect) {
      setUnreadCount(0);
      setNotifications([]);
      setToasts([]);
      setConnectionStatus("offline");
      setError(null);
      hasConnectedOnceRef.current = false;
    }
  }, [shouldConnect, user?._id || user?.id]);

  // Initial fetch on login
  useEffect(() => {
    if (!shouldConnect) return;

    setLoading(true);
    Promise.all([fetchUnreadCount(), fetchTopNotifications()])
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load notifications.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [shouldConnect, user?._id || user?.id]);

  // Requirement 13: Refetch unread count on visibilitychange
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && shouldConnect) {
        fetchUnreadCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [shouldConnect]);

  // Toast removal helper
  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t._id !== id));
  };

  const addToast = (notification) => {
    setToasts((prev) => {
      // Avoid duplicate toasts for the same notification
      if (prev.some((t) => t._id === notification._id)) return prev;
      return [...prev, notification].slice(-3); // Keep at most 3 live toasts
    });
  };

  // Requirement 6: Socket connection effect with complete cleanup
  useEffect(() => {
    if (!shouldConnect) return;

    hasConnectedOnceRef.current = false;
    const socket = createNotificationSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");

      // Requirement 5: Refetch ONLY on reconnect, not on initial connect
      if (hasConnectedOnceRef.current) {
        reconcileAfterReconnect();
      } else {
        hasConnectedOnceRef.current = true;
      }
    });

    // Requirement 3: Use socket.active to tell rejected handshakes from network errors
    socket.on("connect_error", (err) => {
      if (socket.active === false) {
        // Handshake was rejected by server (e.g. invalid token, account deactivated)
        setConnectionStatus("offline");
        // Call GET /api/auth/me once; the response interceptor automatically handles logout on 401/403
        client.get("/auth/me").catch(() => {});
      } else {
        // Temporary network drop while socket.io actively retries
        setConnectionStatus("reconnecting");
      }
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // Server intentionally closed the connection (e.g. account deactivated by admin)
        setConnectionStatus("offline");
        client.get("/auth/me").catch(() => {});
      } else {
        setConnectionStatus("reconnecting");
      }
    });

    // Handle incoming live notification event
    socket.on("notification:new", (newNotif) => {
      if (!newNotif || !newNotif._id) return;

      setNotifications((prev) => {
        // Requirement 1: Increment unread count only when _id isn't already in list
        const alreadyExists = prev.some((n) => n._id === newNotif._id);
        if (alreadyExists) return prev;

        setUnreadCount((count) => count + 1);
        return [newNotif, ...prev].slice(0, 50);
      });

      // Requirement 8: Show toast only for live socket events
      addToast(newNotif);

      // Requirement 9: Version counter for live page 1 synchronization
      setVersion((v) => v + 1);
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [shouldConnect, user?._id || user?.id]);

  // Mark single notification as read
  const markAsRead = async (id) => {
    if (!id) return;

    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
    );

    try {
      await client.patch(`/notifications/${id}/read`);
      // Reconcile with server count
      fetchUnreadCount();
    } catch (err) {
      // Reconcile on error
      fetchUnreadCount();
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    // Optimistic local update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await client.patch("/notifications/read-all");
      fetchUnreadCount();
    } catch (err) {
      fetchUnreadCount();
    }
  };

  // Delete notification
  const deleteNotification = async (id) => {
    if (!id) return;

    setNotifications((prev) => prev.filter((n) => n._id !== id));

    try {
      await client.delete(`/notifications/${id}`);
      fetchUnreadCount();
    } catch (err) {
      fetchUnreadCount();
    }
  };

  const value = {
    unreadCount,
    notifications,
    loading,
    error,
    connectionStatus,
    toasts,
    removeToast,
    version,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchUnreadCount,
    fetchTopNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};