import React from "react";
import { useAuth } from "../context/AuthContext";

export default function RecruiterDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Recruiter dashboard</h1>
        <p className="page-subtitle">Welcome back, {user?.name}</p>
      </div>

      <div className="card">
        <div className="card-header-clean">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Overview</h2>
          <span className="badge-tag">Recruiter</span>
        </div>
        <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", lineHeight: 1.5 }}>
          Manage your company profile, post job openings, review candidate applications, and schedule interviews.
        </p>
      </div>
    </div>
  );
}
