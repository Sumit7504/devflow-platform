import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useNotifications } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import Pagination from "../components/common/Pagination";
import { formatRelativeTime, formatDate, getErrorMessage } from "../utils/formatters";
import { getNotificationRoute } from "../components/notifications/NotificationToast";

export default function NotificationList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    unreadCount,
    version,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  // Validate URL search parameters
  const rawUnread = searchParams.get("unread") || "";
  const isUnreadFilter = rawUnread === "true";

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [notifications, setNotifications] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-flight row action tracking
  const [processingId, setProcessingId] = useState(null);

  // Requirement 11: Shared 60-second tick while page is open so relative times update
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchPageNotifications = (signal) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "10");
    if (isUnreadFilter) {
      params.set("unread", "true");
    }

    client
      .get(`/notifications?${params.toString()}`, { signal })
      .then((res) => {
        if (res.data?.success) {
          setNotifications(res.data.notifications || []);
          setTotalPages(res.data.totalPages || 1);
          setCurrentPage(res.data.currentPage || 1);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load notifications.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchPageNotifications(controller.signal);
    return () => controller.abort();
  }, [page, isUnreadFilter]);

  // Requirement 9: Automatically refetch when a live event occurs while on page 1
  useEffect(() => {
    if (page === 1) {
      const controller = new AbortController();
      fetchPageNotifications(controller.signal);
      return () => controller.abort();
    }
  }, [version]);

  const handleUnreadFilterToggle = (e) => {
    const checked = e.target.checked;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (checked) {
        next.set("unread", "true");
      } else {
        next.delete("unread");
      }
      next.delete("page");
      return next;
    });
  };

  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage > 1) {
        next.set("page", newPage.toString());
      } else {
        next.delete("page");
      }
      return next;
    });
  };

  const handleNotificationClick = (item) => {
    // Mark as read without blocking navigation (Requirement 10)
    if (!item.isRead) {
      markAsRead(item._id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === item._id ? { ...n, isRead: true } : n))
      );
    }

    const destination = getNotificationRoute(item, user?.role);
    if (destination) {
      navigate(destination);
    }
  };

  const handleMarkItemRead = async (e, id) => {
    e.stopPropagation();
    setProcessingId(id);
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
    );
    setProcessingId(null);
  };

  const handleDeleteItem = async (e, id) => {
    e.stopPropagation();
    setProcessingId(id);
    await deleteNotification(id);
    // Remove locally
    setNotifications((prev) => prev.filter((n) => n._id !== id));
    setProcessingId(null);

    // If deleting last row on page, go to previous page
    if (currentPage > 1 && notifications.length === 1) {
      handlePageChange(currentPage - 1);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            Stay updated on your application status, interviews, and assessments.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleMarkAllRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          marginBottom: "1.5rem",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.875rem", margin: 0 }}>
          <input
            type="checkbox"
            checked={isUnreadFilter}
            onChange={handleUnreadFilterToggle}
            style={{ accentColor: "var(--color-accent)" }}
          />
          <span>Show unread only</span>
        </label>

        <span style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </span>
      </div>

      {loading && <Loader message="Loading notifications..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchPageNotifications(controller.signal);
          }}
        />
      )}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {notifications.length === 0 ? (
            <div style={{ padding: "2.5rem" }}>
              <EmptyState
                title="No notifications"
                description={
                  isUnreadFilter
                    ? "You have no unread notifications."
                    : "No notifications have been received yet."
                }
              />
            </div>
          ) : (
            <>
              <div>
                {notifications.map((item) => {
                  const isUnread = !item.isRead;
                  const isProcessing = processingId === item._id;

                  return (
                    <div
                      key={item._id}
                      role="button"
                      tabIndex={0}
                      style={{
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--color-border)",
                        backgroundColor: isUnread ? "#f0fdfa" : "var(--color-card)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        transition: "background-color 0.15s ease",
                      }}
                      onClick={() => handleNotificationClick(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNotificationClick(item);
                        }
                      }}
                    >
                      {/* Visual Unread Dot + Accessible Hidden Text (Requirement 12) */}
                      <div style={{ paddingTop: "6px" }}>
                        {isUnread ? (
                          <span
                            style={{
                              display: "inline-block",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor: "var(--color-accent)",
                            }}
                          >
                            <span className="sr-only" style={{ display: "none" }}>Unread</span>
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", width: "8px", height: "8px" }} />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.9375rem",
                            fontWeight: isUnread ? 700 : 600,
                            color: "var(--color-text)",
                            marginBottom: "2px",
                          }}
                        >
                          {item.title}
                        </div>
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--color-text-gray)",
                            lineHeight: 1.5,
                            margin: "0 0 6px 0",
                            wordBreak: "break-word",
                          }}
                        >
                          {item.message}
                        </p>
                        <div
                          title={item.createdAt ? formatDate(item.createdAt) : ""}
                          style={{ fontSize: "0.75rem", color: "var(--color-text-gray)" }}
                        >
                          {formatRelativeTime(item.createdAt)}
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexShrink: 0,
                          alignSelf: "center",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isUnread && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                            onClick={(e) => handleMarkItemRead(e, item._id)}
                            disabled={isProcessing}
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{
                            padding: "4px 8px",
                            fontSize: "0.75rem",
                            color: "var(--color-error)",
                            borderColor: "var(--color-border)",
                          }}
                          onClick={(e) => handleDeleteItem(e, item._id)}
                          disabled={isProcessing}
                          aria-label="Delete notification"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Shared Pagination component */}
              <div style={{ padding: "1rem" }}>
                <Pagination
                  page={currentPage}
                  pages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}