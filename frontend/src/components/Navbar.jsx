import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
      <div className="navbar-inner">
        <div className="nav-left">
          <Link to="/" className="nav-brand">
            DevFlow
          </Link>

          <div className="nav-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Home
            </NavLink>

            {isAuthenticated && user && (
              <NavLink
                to={getDashboardPath(user.role)}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                Dashboard
              </NavLink>
            )}
          </div>
        </div>

        <div className="nav-right">
          {isAuthenticated && user ? (
            <>
              <span className="nav-user">{user.name}</span>
              <span className="badge-tag">{user.role}</span>
              <button onClick={handleLogout} className="btn btn-outline">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary" style={{ height: "38px" }}>
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
