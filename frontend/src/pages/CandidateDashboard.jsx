import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";

export default function CandidateDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApplications = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client
      .get("/applications/my", { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.applications)) {
          setApplications(res.data.applications);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load applications.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchApplications();
    return cleanup;
  }, []);

  const newestThree = applications.slice(0, 3);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Candidate dashboard</h1>
          <p className="page-subtitle">Track your recent applications and explore open positions.</p>
        </div>
        <Link to="/candidate/jobs" className="btn btn-primary">
          Browse jobs
        </Link>
      </div>

      {loading && <Loader message="Loading dashboard..." />}

      {error && <ErrorMessage message={error} onRetry={fetchApplications} />}

      {!loading && !error && (
        <>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div className="card-header-clean">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Recent applications</h2>
              {applications.length > 0 && (
                <Link to="/candidate/applications" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                  View all ({applications.length})
                </Link>
              )}
            </div>

            {applications.length === 0 ? (
              <EmptyState
                title="No applications yet"
                description="You haven't submitted any job applications yet. Find an open position that fits your profile."
                actionLink="/candidate/jobs"
                actionText="Browse open jobs"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {newestThree.map((app) => (
                  <div
                    key={app._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.875rem 1rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text)" }}>
                        {app.job?.title || "Untitled Role"}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                        {app.job?.company?.name || "Company"} · Applied on {formatDate(app.createdAt)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <StatusBadge status={app.status} />
                      <Link to={`/candidate/applications/${app._id}`} className="btn btn-outline btn-sm">
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Explore opportunities
            </h2>
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
              Browse engineering, design, and product roles at fast-growing tech companies.
            </p>
            <Link to="/candidate/jobs" className="btn btn-outline btn-sm">
              Explore job board →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
