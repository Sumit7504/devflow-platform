import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import { getErrorMessage } from "../utils/formatters";

// Label mapping dictionary for real status and role keys from the backend API
const LABEL_MAP = {
  // Roles
  candidate: "Candidate",
  recruiter: "Recruiter",
  admin: "Admin",

  // User Status
  active: "Active",
  inactive: "Inactive",

  // Job Status
  open: "Open",
  closed: "Closed",

  // Application Status
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",

  // Interview Status
  proposed: "Proposed",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",

  // Attempt Status
  in_progress: "In Progress",
  submitted: "Submitted",
  graded: "Graded",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = (signal) => {
    setLoading(true);
    setError(null);

    client
      .get("/admin/stats", { signal })
      .then((res) => {
        if (res.data?.success && res.data.stats) {
          setStats(res.data.stats);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load platform statistics.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => controller.abort();
  }, []);

  const formatNumber = (val) => new Intl.NumberFormat(undefined).format(val || 0);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Admin Overview</h1>
          <p className="page-subtitle">Platform-wide statistics and system metrics.</p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link to="/admin/users" className="btn btn-outline btn-sm">
            Manage Users
          </Link>
          <Link to="/admin/jobs" className="btn btn-outline btn-sm">
            Manage Jobs
          </Link>
        </div>
      </div>

      {loading && <Loader message="Loading platform analytics..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchStats(controller.signal);
          }}
        />
      )}

      {!loading && !error && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {/* 1. Users Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Users</h2>
              <Link
                to="/admin/users"
                style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)", textDecoration: "none" }}
              >
                {formatNumber(stats.users?.total)}
              </Link>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Account Status
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                {stats.users?.byStatus &&
                  Object.keys(stats.users.byStatus).map((statusKey) => (
                    <Link
                      key={statusKey}
                      to={`/admin/users?isActive=${statusKey === "active" ? "true" : "false"}`}
                      style={{ fontSize: "0.875rem", textDecoration: "none", color: "var(--color-text)" }}
                    >
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[statusKey] || statusKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.users.byStatus[statusKey])}</strong>
                    </Link>
                  ))}
              </div>

              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Role
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {stats.users?.byRole &&
                  Object.keys(stats.users.byRole).map((roleKey) => (
                    <Link
                      key={roleKey}
                      to={`/admin/users?role=${roleKey}`}
                      style={{ fontSize: "0.875rem", textDecoration: "none", color: "var(--color-text)" }}
                    >
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[roleKey] || roleKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.users.byRole[roleKey])}</strong>
                    </Link>
                  ))}
              </div>
            </div>
          </div>

          {/* 2. Jobs Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Jobs</h2>
              <Link
                to="/admin/jobs"
                style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)", textDecoration: "none" }}
              >
                {formatNumber(stats.jobs?.total)}
              </Link>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Status
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {stats.jobs?.byStatus &&
                  Object.keys(stats.jobs.byStatus).map((statusKey) => (
                    <Link
                      key={statusKey}
                      to={`/admin/jobs?status=${statusKey}`}
                      style={{ fontSize: "0.875rem", textDecoration: "none", color: "var(--color-text)" }}
                    >
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[statusKey] || statusKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.jobs.byStatus[statusKey])}</strong>
                    </Link>
                  ))}
              </div>
            </div>
          </div>

          {/* 3. Applications Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Applications</h2>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)" }}>
                {formatNumber(stats.applications?.total)}
              </span>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Status
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {stats.applications?.byStatus &&
                  Object.keys(stats.applications.byStatus).map((statusKey) => (
                    <div key={statusKey} style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[statusKey] || statusKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.applications.byStatus[statusKey])}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* 4. Interviews Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Interviews</h2>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)" }}>
                {formatNumber(stats.interviews?.total)}
              </span>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Status
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {stats.interviews?.byStatus &&
                  Object.keys(stats.interviews.byStatus).map((statusKey) => (
                    <div key={statusKey} style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[statusKey] || statusKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.interviews.byStatus[statusKey])}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* 5. Assessment Attempts Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Assessment Attempts</h2>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)" }}>
                {formatNumber(stats.attempts?.total)}
              </span>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", fontWeight: 600, marginBottom: "4px" }}>
                By Status
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {stats.attempts?.byStatus &&
                  Object.keys(stats.attempts.byStatus).map((statusKey) => (
                    <div key={statusKey} style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>
                      <span style={{ color: "var(--color-text-gray)" }}>
                        {LABEL_MAP[statusKey] || statusKey}:
                      </span>{" "}
                      <strong>{formatNumber(stats.attempts.byStatus[statusKey])}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* 6. Companies Card */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Registered Companies</h2>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)" }}>
                {formatNumber(stats.companies?.total)}
              </span>
            </div>
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginTop: "1rem", marginBottom: 0 }}>
              Total active recruiter company profiles on DevFlow.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}