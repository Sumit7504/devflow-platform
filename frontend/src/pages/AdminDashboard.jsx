import React from "react";
import { useAuth } from "../context/AuthContext";

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin overview</h1>
        <p className="page-subtitle">System administrator: {user?.name}</p>
      </div>

      <div className="card">
        <div className="card-header-clean">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Platform management</h2>
          <span className="badge-tag">Admin</span>
        </div>
        <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", lineHeight: 1.5 }}>
          Platform oversight: manage user accounts and permissions, review all jobs, and inspect system-wide analytics.
        </p>
      </div>
    </div>
  );
}
