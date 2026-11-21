import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Unauthorized() {
  const { user } = useAuth();

  const getDashboardPath = (role) => {
    if (role === "recruiter") return "/recruiter";
    if (role === "admin") return "/admin";
    return "/candidate";
  };

  return (
    <div className="card" style={{ maxWidth: "500px", margin: "3rem auto", textAlign: "center", padding: "2.5rem 2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--color-text)" }}>
        Access denied
      </h1>
      <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.75rem", lineHeight: 1.5 }}>
        You do not have permission to view this page with your current role.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
        <Link to="/" className="btn btn-outline">
          Back to home
        </Link>
        {user && (
          <Link to={getDashboardPath(user.role)} className="btn btn-primary">
            Go to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
