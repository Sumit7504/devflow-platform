import React from "react";
import { useAuth } from "../context/AuthContext";

export default function RecruiterDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
              Recruiter Dashboard
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Welcome back, {user?.name} ({user?.email})
            </p>
          </div>
          <span className="badge badge-recruiter">Recruiter</span>
        </div>

        <p style={{ color: "var(--text-muted)" }}>
          Manage your company profile, post job openings, review candidate applications, and schedule interviews.
        </p>
      </div>
    </div>
  );
}
