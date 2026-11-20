import React from "react";
import { useAuth } from "../context/AuthContext";

export default function CandidateDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
              Candidate Dashboard
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Welcome back, {user?.name} ({user?.email})
            </p>
          </div>
          <span className="badge badge-candidate">Candidate</span>
        </div>

        <p style={{ color: "var(--text-muted)" }}>
          Browse open job postings, take skill assessments, and track your active job applications.
        </p>
      </div>
    </div>
  );
}
