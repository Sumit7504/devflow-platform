import React from "react";
import { useAuth } from "../context/AuthContext";

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
              Admin Console
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              System Administrator: {user?.name} ({user?.email})
            </p>
          </div>
          <span className="badge badge-admin">Admin</span>
        </div>

        <p style={{ color: "var(--text-muted)" }}>
          Platform oversight: manage user accounts and permissions, review all jobs, and inspect system-wide analytics.
        </p>
      </div>
    </div>
  );
}
