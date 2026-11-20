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
    <div className="card" style={{ maxWidth: "680px", margin: "2rem auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem", color: "var(--primary)" }}>
        DevFlow Platform
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "1.1rem", marginBottom: "2rem" }}>
        Modern hiring, assessment and real-time collaboration for engineering teams and candidates.
      </p>

      {isAuthenticated && user ? (
        <div style={{ background: "#f8fafc", padding: "1.5rem", borderRadius: "var(--radius)" }}>
          <p style={{ marginBottom: "1rem", fontSize: "1rem" }}>
            Welcome back, <strong>{user.name}</strong>! You are logged in as a{" "}
            <span className={`badge badge-${user.role}`}>{user.role}</span>.
          </p>
          <Link to={getDashboardPath(user.role)} className="btn btn-primary">
            Go to Your Dashboard →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link to="/login" className="btn btn-outline" style={{ padding: "0.6rem 1.5rem" }}>
            Sign In
          </Link>
          <Link to="/register" className="btn btn-primary" style={{ padding: "0.6rem 1.5rem", color: "white" }}>
            Create Account
          </Link>
        </div>
      )}
    </div>
  );
}
