import React, { useState, useRef } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import NotificationDropdown from "./notifications/NotificationDropdown";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const bellButtonRef = useRef(null);

  const handleLogout = () => {
    setIsDropdownOpen(false);
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
                <NavLink
                  to="/candidate/attempts"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Assessments
                </NavLink>
                <NavLink
                  to="/candidate/interviews"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Interviews
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
                  to="/recruiter/interviews"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Interviews
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
              <>
                <NavLink
                  to="/admin"
                  end
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Overview
                </NavLink>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Users
                </NavLink>
                <NavLink
                  to="/admin/jobs"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  Jobs
                </NavLink>
              </>
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

        <div className="nav-right" style={{ position: "relative" }}>
          {isAuthenticated && user ? (
            <>
              {/* Notification Bell (Candidate & Recruiter only) */}
              {(user.role === "candidate" || user.role === "recruiter") && (
                <div style={{ position: "relative" }}>
                  <button
                    ref={bellButtonRef}
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{
                      position: "relative",
                      padding: "6px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--color-border)",
                      backgroundColor: isDropdownOpen ? "var(--color-bg)" : "var(--color-card)",
                    }}
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    aria-label={`Notifications, ${unreadCount} unread`}
                    aria-expanded={isDropdownOpen}
                    aria-controls="notification-dropdown-panel"
                  >
                    {/* Small Inline SVG Bell (Requirement 12) */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: "var(--color-text)" }}
                      aria-hidden="true"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>

                    {/* Unread count badge */}
                    {unreadCount > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: "-4px",
                          right: "-4px",
                          backgroundColor: "var(--color-accent)",
                          color: "#ffffff",
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          minWidth: "16px",
                          height: "16px",
                          borderRadius: "9999px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 4px",
                          lineHeight: 1,
                        }}
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  <NotificationDropdown
                    isOpen={isDropdownOpen}
                    onClose={() => setIsDropdownOpen(false)}
                    openerRef={bellButtonRef}
                  />
                </div>
              )}

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
