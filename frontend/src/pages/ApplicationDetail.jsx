import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { formatDate, isValidHttpUrl, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";

export default function ApplicationDetail() {
  const { id } = useParams();

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApplication = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client
      .get(`/applications/${id}`, { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && res.data.application) {
          setApplication(res.data.application);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load application details.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchApplication();
    return cleanup;
  }, [id]);

  if (loading) {
    return <Loader message="Loading application..." />;
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/candidate/applications" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
            ← Back to my applications
          </Link>
        </div>
        <ErrorMessage message={error} onRetry={fetchApplication} />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>Application not found.</p>
        <Link to="/candidate/applications" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to applications
        </Link>
      </div>
    );
  }

  const resumeValid = isValidHttpUrl(application.resumeUrl);
  // Status history chronologically from oldest to newest
  const history = Array.isArray(application.statusHistory)
    ? [...application.statusHistory].sort(
        (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
      )
    : [];

  return (
    <div>
      {/* Back Link */}
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/candidate/applications"
          style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
        >
          ← Back to my applications
        </Link>
      </div>

      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">{application.job?.title || "Untitled Position"}</h1>
          <div style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
            {application.job?.company?.name || "Company"} · Applied on {formatDate(application.createdAt)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StatusBadge status={application.status} />
          {application.job?._id && (
            <Link to={`/candidate/jobs/${application.job._id}`} className="btn btn-outline btn-sm">
              View job posting
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              Application submission
            </h2>

            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                Candidate Name
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                {application.candidate?.name} ({application.candidate?.email})
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                Resume
              </div>
              <div>
                {application.resumeUrl ? (
                  resumeValid ? (
                    <a
                      href={application.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.9375rem", wordBreak: "break-all" }}
                    >
                      {application.resumeUrl} ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", wordBreak: "break-all" }}>
                      {application.resumeUrl}
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)" }}>
                    No resume provided
                  </span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                Cover Letter
              </div>
              {application.coverLetter ? (
                <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, whiteSpace: "pre-line", color: "var(--color-text)" }}>
                  {application.coverLetter}
                </p>
              ) : (
                <span style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)" }}>
                  No cover letter provided
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Status Timeline */}
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
            Status timeline
          </h2>

          {history.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
              No history recorded.
            </p>
          ) : (
            <div className="timeline">
              {history.map((item, idx) => (
                <div key={item._id || idx} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="timeline-time">
                      {formatDate(item.changedAt)}
                    </div>
                    {item.changedBy && (
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                        Updated by {item.changedBy.name || "System"} ({item.changedBy.role || "user"})
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
