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

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="nav-left">
          <Link to={user?.role === "candidate" ? "/candidate" : "/"} className="nav-brand">
            DevFlow
          </Link>

          <div className="nav-links">
            {isAuthenticated && user?.role === "candidate" ? (
              <>
                <NavLink
                  to="/candidate/jobs"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Jobs
                </NavLink>
                <NavLink
                  to="/candidate/applications"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  My applications
                </NavLink>
              </>
            ) : isAuthenticated && user ? (
              <NavLink
                to={user.role === "recruiter" ? "/recruiter" : "/admin"}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                Dashboard
              </NavLink>
            ) : (
              <NavLink
                to="/"
                end
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                Home
              </NavLink>
            )}
          </div>
        </div>

        <div className="nav-right">
          {isAuthenticated && user ? (
            <>
              <span className="nav-user">{user.name}</span>
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
