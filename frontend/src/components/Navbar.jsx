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

  const getBrandDestination = () => {
    if (!isAuthenticated || !user) return "/";
    if (user.role === "candidate") return "/candidate";
    if (user.role === "recruiter") return "/recruiter";
    if (user.role === "admin") return "/admin";
    return "/";
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="nav-left">
          <Link to={getBrandDestination()} className="nav-brand">
            DevFlow
          </Link>

          <div className="nav-links">
            {isAuthenticated && user?.role === "candidate" && (
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
            )}

            {isAuthenticated && user?.role === "recruiter" && (
              <>
                <NavLink
                  to="/recruiter"
                  end
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/recruiter/company"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Company
                </NavLink>
                <NavLink
                  to="/recruiter/jobs"
                  end
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Jobs
                </NavLink>
                <NavLink
                  to="/recruiter/jobs/new"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Post a job
                </NavLink>
              </>
            )}

            {isAuthenticated && user?.role === "admin" && (
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                Dashboard
              </NavLink>
            )}

            {!isAuthenticated && (
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
