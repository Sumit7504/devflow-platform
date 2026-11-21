import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { formatRelativeTime, formatDate } from "../../utils/formatters";
import { getNotificationRoute } from "./NotificationToast";

export default function NotificationDropdown({ isOpen, onClose, openerRef }) {
  const {
    unreadCount,
    notifications,
    connectionStatus,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  const dropdownRef = useRef(null);

  // Requirement 11: Shared 60-second tick while dropdown is open so relative times update
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Keyboard navigation: Escape key closes and returns focus to the bell button (Requirement 12)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        if (openerRef?.current) {
          openerRef.current.focus();
        }
      }
    };

    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        openerRef?.current &&
        !openerRef.current.contains(e.target)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, openerRef]);

  if (!isOpen) return null;

  const top10 = (notifications || []).slice(0, 10);

  const handleNotificationClick = (item) => {
    // Mark as read first without blocking navigation (Requirement 10)
    if (!item.isRead) {
      markAsRead(item._id);
    }
    onClose();

    const destination = getNotificationRoute(item, user?.role);
    if (destination) {
      navigate(destination);
    }
  };

  return (
    <div
      id="notification-dropdown-panel"
      ref={dropdownRef}
      className="card"
      style={{
        position: "absolute",
        top: "52px",
        right: 0,
        width: "360px",
        maxWidth: "90vw",
        padding: 0,
        margin: 0,
        zIndex: 1000,
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: 0 }}>
            Notifications
          </h2>
          {connectionStatus !== "connected" && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-gray)",
              }}
            >
              {connectionStatus === "reconnecting" ? "(Reconnecting...)" : "(Offline)"}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ padding: "2px 8px", fontSize: "0.75rem", border: "none", color: "var(--color-accent)" }}
            onClick={markAllAsRead}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div style={{ maxHeight: "380px", overflowY: "auto" }}>
        {top10.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-gray)", fontSize: "0.875rem" }}>
            No notifications yet.
          </div>
        ) : (
          top10.map((item) => {
            const isUnread = !item.isRead;

            return (
              <div
                key={item._id}
                role="button"
                tabIndex={0}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  backgroundColor: isUnread ? "#f0fdfa" : "var(--color-card)",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
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
                <div style={{ paddingTop: "4px" }}>
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
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: isUnread ? 700 : 600,
                      color: "var(--color-text)",
                      marginBottom: "2px",
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--color-text-gray)",
                      lineHeight: 1.4,
                      marginBottom: "4px",
                      wordBreak: "break-word",
                    }}
                  >
                    {item.message}
                  </div>
                  <div
                    title={item.createdAt ? formatDate(item.createdAt) : ""}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-text-gray)",
                    }}
                  >
                    {formatRelativeTime(item.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--color-border)",
          textAlign: "center",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <Link
          to="/notifications"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-accent)",
            fontWeight: 600,
            textDecoration: "none",
          }}
          onClick={onClose}
        >
          View all notifications →
        </Link>
      </div>
    </div>
  );
}