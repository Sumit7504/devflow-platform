import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: "500px", margin: "3rem auto", textAlign: "center" }}>
      <h2 style={{ fontSize: "2rem", color: "var(--primary)", marginBottom: "0.75rem" }}>
        404
      </h2>
      <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Page Not Found</h3>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn btn-primary" style={{ color: "white" }}>
        Return to Home
      </Link>
    </div>
  );
}
