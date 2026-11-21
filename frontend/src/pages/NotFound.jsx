import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: "500px", margin: "3rem auto", textAlign: "center", padding: "2.5rem 2rem" }}>
      <h1 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-accent)" }}>
        404
      </h1>
      <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-text)" }}>
        Page not found
      </h2>
      <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.75rem" }}>
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn btn-primary">
        Return to home
      </Link>
    </div>
  );
}
