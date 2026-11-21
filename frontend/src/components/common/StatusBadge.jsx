import React from "react";

export default function StatusBadge({ status }) {
  if (!status) return null;

  const normalized = status.toLowerCase();
  const label =
    normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/-/g, " ");

  return <span className={`status-badge status-${normalized}`}>{label}</span>;
}
