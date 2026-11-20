import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getDashboardPath = (role) => {
    if (role === "recruiter") return "/recruiter";
    if (role === "admin") return "/admin";
    return "/candidate";
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span>DevFlow</span>
      </Link>

      <div className="nav-links">
        <Link to="/">Home</Link>

        {isAuthenticated && user ? (
          <>
            <Link to={getDashboardPath(user.role)}>Dashboard</Link>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {user.name}
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-outline"
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="btn btn-primary" style={{ color: "white" }}>
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
