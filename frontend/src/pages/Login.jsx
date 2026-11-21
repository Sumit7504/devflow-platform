import React, { useState } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to determine role dashboard path
  const getRoleDashboard = (role) => {
    if (role === "recruiter") return "/recruiter";
    if (role === "admin") return "/admin";
    return "/candidate";
  };

  // Redirect already authenticated users away from /login
  if (isAuthenticated && user) {
    return <Navigate to={getRoleDashboard(user.role)} replace />;
  }

  // Check if target path is permitted for the user's role
  const isAllowedDestination = (path, role) => {
    if (!path || path === "/login" || path === "/register" || path === "/unauthorized") return false;
    if (path.startsWith("/candidate") && role !== "candidate") return false;
    if (path.startsWith("/recruiter") && role !== "recruiter") return false;
    if (path.startsWith("/admin") && role !== "admin") return false;
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError("");
    setIsSubmitting(true);

    try {
      const data = await login(email, password);

      if (data?.success && data?.user) {
        const from = location.state?.from?.pathname;
        const target = isAllowedDestination(from, data.user.role)
          ? from
          : getRoleDashboard(data.user.role);
        navigate(target, { replace: true });
      }
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        const respData = err.response.data;

        // Backend 422: list of { field, message }
        if (status === 422 && Array.isArray(respData.errors)) {
          const mapped = {};
          respData.errors.forEach((e) => {
            mapped[e.field] = e.message;
          });
          setFieldErrors(mapped);
        } else {
          // 400, 401, 403, etc.
          setGeneralError(respData.message || "Invalid email or password.");
        }
      } else {
        setGeneralError("Unable to reach server. Please check your network connection.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-brand">DevFlow</div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-subtitle">Hiring and assessments in one place.</p>

        {generalError && <div className="alert alert-danger">{generalError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={`form-control ${fieldErrors.email ? "is-invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={isSubmitting}
              required
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`form-control ${fieldErrors.password ? "is-invalid" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "0.25rem" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
