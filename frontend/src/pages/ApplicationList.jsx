import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";

export default function ApplicationList() {
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

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">My applications</h1>
          <p className="page-subtitle">Track the status and history of your job applications.</p>
        </div>
        <Link to="/candidate/jobs" className="btn btn-primary">
          Browse jobs
        </Link>
      </div>

      {loading && <Loader message="Loading your applications..." />}

      {error && <ErrorMessage message={error} onRetry={fetchApplications} />}

      {!loading && !error && (
        <>
          {applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="You haven't submitted any job applications yet. Find an open position and submit your application."
              actionLink="/candidate/jobs"
              actionText="Browse open jobs"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {applications.map((app) => (
                <div
                  key={app._id}
                  className="card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    margin: 0,
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text)", marginBottom: "4px" }}>
                      {app.job?.title || "Untitled Role"}
                    </h2>
                    <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                      {app.job?.company?.name || "Company"}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                      Applied on {formatDate(app.createdAt)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                    <StatusBadge status={app.status} />
                    <Link
                      to={`/candidate/applications/${app._id}`}
                      className="btn btn-outline"
                      style={{ height: "38px" }}
                    >
                      View details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
