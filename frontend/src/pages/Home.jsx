import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user, isAuthenticated } = useAuth();

  const getDashboardPath = (role) => {
    if (role === "recruiter") return "/recruiter";
    if (role === "admin") return "/admin";
    return "/candidate";
  };

  return (
    <div className="card" style={{ maxWidth: "560px", margin: "3rem auto", textAlign: "center", padding: "2.5rem 2rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text)" }}>
        DevFlow
      </h1>
      <p style={{ color: "var(--color-text-gray)", fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "2rem" }}>
        Hiring and assessments in one place. Streamlined workflows for candidates, recruiters, and administrators.
      </p>

      {isAuthenticated && user ? (
        <div style={{ background: "var(--color-bg)", padding: "1.25rem", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
          <p style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "var(--color-text)" }}>
            Signed in as <strong>{user.name}</strong> ({user.role}).
          </p>
          <Link to={getDashboardPath(user.role)} className="btn btn-primary">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <Link to="/login" className="btn btn-outline" style={{ minWidth: "120px" }}>
            Sign in
          </Link>
          <Link to="/register" className="btn btn-primary" style={{ minWidth: "140px" }}>
            Create account
          </Link>
        </div>
      )}
    </div>
  );
}
