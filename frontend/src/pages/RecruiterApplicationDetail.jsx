import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isValidHttpUrl, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";

export default function RecruiterApplicationDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Status change state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  // Inline confirmation state: null | "rejected" | "hired"
  const [confirmStatus, setConfirmStatus] = useState(null);
  const confirmOpenerRef = useRef(null);

  // Active interview state
  const [activeInterview, setActiveInterview] = useState(null);
  const [interviewLookupError, setInterviewLookupError] = useState(false);

  const fetchActiveInterview = (signal) => {
    setInterviewLookupError(false);
    client
      .get(`/interviews/recruiter?application=${id}&active=true`, { signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.interviews)) {
          setActiveInterview(res.data.interviews[0] || null);
        }
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setInterviewLookupError(true);
        }
      });
  };

  const fetchApplication = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    fetchActiveInterview(controller.signal);

    client
      .get(`/applications/${id}`, { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && res.data.application) {
          const app = res.data.application;

          // Verify ownership: recruiter must have posted the job
          const postedById = (app.job?.postedBy?._id || app.job?.postedBy)?.toString();
          const currentUserId = (user?._id || user?.id)?.toString();
          if (postedById && currentUserId && postedById !== currentUserId) {
            setUnauthorized(true);
            return;
          }

          setApplication(app);
        }
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setUnauthorized(true);
        } else {
          const msg = getErrorMessage(err, "Failed to load application details.");
          if (msg) setError(msg);
        }
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

  const handleOpenConfirm = (targetStatus, e) => {
    confirmOpenerRef.current = e.currentTarget;
    setConfirmStatus(targetStatus);
    setStatusError("");
    setSuccessMessage("");
  };

  const handleCancelConfirm = () => {
    setConfirmStatus(null);
    if (confirmOpenerRef.current) {
      confirmOpenerRef.current.focus();
    }
  };

  const handleStatusChange = async (targetStatus) => {
    setIsUpdatingStatus(true);
    setStatusError("");
    setSuccessMessage("");

    try {
      const res = await client.patch(`/applications/${id}/status`, { status: targetStatus });
      if (res.data?.success) {
        setConfirmStatus(null);
        setSuccessMessage(`Application status updated to ${targetStatus}.`);
        // Refetch full application detail to receive updated statusHistory with user details
        fetchApplication();
      }
    } catch (err) {
      if (err.response) {
        setStatusError(err.response.data?.message || "Failed to update application status.");
      } else {
        setStatusError("Unable to reach server. Please check your network connection.");
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (unauthorized) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to jobs
          </Link>
        </div>
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
            Access denied
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            You are not authorized to view or manage this application.
          </p>
          <Link to="/recruiter/jobs" className="btn btn-outline btn-sm">
            Back to my jobs
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loader message="Loading application..." />;
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to jobs
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
        <Link to="/recruiter/jobs" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to jobs
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

  const currentStatus = application.status;

  return (
    <div>
      {/* Back Link */}
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to={`/recruiter/jobs/${application.job?._id}/applicants`}
          style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
        >
          ← Back to applicants
        </Link>
      </div>

      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">{application.candidate?.name || "Candidate"}</h1>
          <div style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
            {application.candidate?.email} · Applied for {application.job?.title} on {formatDate(application.createdAt)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StatusBadge status={currentStatus} />
        </div>
      </div>

      {/* Alerts */}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {statusError && <div className="alert alert-danger">{statusError}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Submission Details & Status Change Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Status Change Controls */}
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Application actions
            </h2>
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              Update the candidate's hiring stage. Candidates receive real-time updates upon status changes.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              {/* Shortlist action (direct, no destructive confirmation required) */}
              {currentStatus !== "shortlisted" && !confirmStatus && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleStatusChange("shortlisted")}
                  disabled={isUpdatingStatus}
                >
                  Shortlist
                </button>
              )}

              {/* Schedule / View Interview action (available when shortlisted) */}
              {currentStatus === "shortlisted" && !confirmStatus && (
                interviewLookupError ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ color: "var(--color-error)", borderColor: "var(--color-border)" }}
                    onClick={() => fetchActiveInterview()}
                  >
                    Retry interview check
                  </button>
                ) : activeInterview ? (
                  <Link
                    to={`/recruiter/interviews/${activeInterview._id}`}
                    className="btn btn-outline"
                  >
                    View interview ({activeInterview.status})
                  </Link>
                ) : (
                  <Link
                    to={`/recruiter/applications/${id}/interview/new`}
                    className="btn btn-outline"
                  >
                    Schedule interview
                  </Link>
                )
              )}

              {/* Reject action (requires inline confirmation) */}
              {currentStatus !== "rejected" && !confirmStatus && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={(e) => handleOpenConfirm("rejected", e)}
                  disabled={isUpdatingStatus}
                >
                  Reject
                </button>
              )}

              {/* Hire action (requires inline confirmation) */}
              {currentStatus !== "hired" && !confirmStatus && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={(e) => handleOpenConfirm("hired", e)}
                  disabled={isUpdatingStatus}
                >
                  Hire candidate
                </button>
              )}

              {/* Inline Confirmation Prompt */}
              {confirmStatus && (
                <div className="inline-confirm">
                  <span className="confirm-text" aria-live="polite">
                    Are you sure you want to mark this candidate as <strong>{confirmStatus}</strong>?
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleStatusChange(confirmStatus)}
                    disabled={isUpdatingStatus}
                  >
                    {isUpdatingStatus ? "Updating..." : `Yes, ${confirmStatus}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleCancelConfirm}
                    disabled={isUpdatingStatus}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Submission Details */}
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              Candidate submission
            </h2>

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

        {/* Right Column: Status History Audit Timeline */}
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
            Status history
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
                    {item.changedBy && (typeof item.changedBy === "object" ? item.changedBy.name : null) && (
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                        Changed by {item.changedBy.name} ({item.changedBy.role || "recruiter"})
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
