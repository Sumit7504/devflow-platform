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
    <div className="card" style={{ maxWidth: "540px", margin: "3rem auto", textAlign: "center" }}>
      <h2 style={{ fontSize: "1.75rem", color: "var(--danger)", marginBottom: "0.75rem" }}>
        403 — Access Denied
      </h2>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        You do not have the required permissions to access this page with your current role.
      </p>

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <Link to="/" className="btn btn-outline">
          Back to Home
        </Link>
        {user && (
          <Link to={getDashboardPath(user.role)} className="btn btn-primary" style={{ color: "white" }}>
            Go to Your Dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
