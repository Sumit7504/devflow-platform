import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { isValidObjectId } from "../../utils/formatters";

// Resolves destination route based strictly on user's role and 24-hex valid ID (Requirement 10)
export function getNotificationRoute(notification, userRole) {
  if (!notification || !userRole) return null;
  const { type, data } = notification;

  if (userRole === "candidate") {
    if (type === "application_status" && isValidObjectId(data?.application)) {
      return `/candidate/applications/${data.application}`;
    }
    if (type === "assessment_graded" && isValidObjectId(data?.attempt)) {
      return `/candidate/attempts/${data.attempt}`;
    }
    if (type === "interview_proposed" || type === "interview_cancelled") {
      return "/candidate/interviews";
    }
  } else if (userRole === "recruiter") {
    if (type === "application_received" && isValidObjectId(data?.application)) {
      return `/recruiter/applications/${data.application}`;
    }
    if (type === "assessment_submitted" && isValidObjectId(data?.attempt)) {
      return `/recruiter/attempts/${data.attempt}`;
    }
    if ((type === "interview_confirmed" || type === "interview_declined") && isValidObjectId(data?.interview)) {
      return `/recruiter/interviews/${data.interview}`;
    }
  }
  return null;
}

function ToastItem({ toast, onDismiss, onSelect }) {
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    timerRef.current = setTimeout(() => {
      onDismiss(toast._id);
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast._id, isPaused, onDismiss]);

  return (
    <div
      role="status"
      className="notification-toast-item"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: "12px 16px",
        boxShadow: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        maxWidth: "360px",
        width: "100%",
        cursor: "pointer",
        position: "relative",
      }}
      onClick={() => onSelect(toast)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text)", marginBottom: "2px" }}>
          {toast.title}
        </div>
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-text-gray)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {toast.message}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{
          border: "none",
          padding: "2px 6px",
          color: "var(--color-text-gray)",
          fontSize: "1rem",
          lineHeight: 1,
          alignSelf: "flex-start",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast._id);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default function NotificationToast() {
  const { toasts, removeToast, markAsRead } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!toasts || toasts.length === 0) return null;

  const handleSelectToast = (toast) => {
    // Mark as read without blocking navigation (Requirement 10)
    markAsRead(toast._id);
    removeToast(toast._id);

    const destination = getNotificationRoute(toast, user?.role);
    if (destination) {
      navigate(destination);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast._id}
          toast={toast}
          onDismiss={removeToast}
          onSelect={handleSelectToast}
        />
      ))}
    </div>
  );
}