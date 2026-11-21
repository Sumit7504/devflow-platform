import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";
import {
  formatSlotRange,
  isValidHttpUrl,
  formatDate,
  getErrorMessage,
} from "../utils/formatters";

export default function RecruiterInterviewDetail() {
  const { id } = useParams();

  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);

  // Cancellation state
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelOpenerRef = useRef(null);

  const fetchInterview = (signal) => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    client
      .get(`/interviews/${id}`, { signal })
      .then((res) => {
        if (res.data?.success && res.data.interview) {
          setInterview(res.data.interview);
        }
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setUnauthorized(true);
        } else {
          const msg = getErrorMessage(err, "Failed to load interview details.");
          if (msg) setError(msg);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchInterview(controller.signal);
    return () => controller.abort();
  }, [id]);

  const handleOpenCancelConfirm = (e) => {
    cancelOpenerRef.current = e.currentTarget;
    setConfirmCancel(true);
    setCancelError("");
  };

  const handleCloseCancelConfirm = () => {
    setConfirmCancel(false);
    if (cancelOpenerRef.current) {
      cancelOpenerRef.current.focus();
    }
  };

  const handleCancelInterview = async () => {
    setCancelling(true);
    setCancelError("");

    try {
      const res = await client.patch(`/interviews/${id}/cancel`);
      if (res.data?.success) {
        setConfirmCancel(false);
        // Refetch to receive fresh populated data
        fetchInterview();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to cancel interview.");
      setCancelError(msg);
    } finally {
      setCancelling(false);
    }
  };

  if (unauthorized) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to="/recruiter/interviews"
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to interviews
          </Link>
        </div>
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
            Access denied
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            You are not authorized to view this interview.
          </p>
          <Link to="/recruiter/interviews" className="btn btn-outline btn-sm">
            Back to interviews
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loader message="Loading interview details..." />;
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to="/recruiter/interviews"
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to interviews
          </Link>
        </div>
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchInterview(controller.signal);
          }}
        />
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>Interview not found.</p>
        <Link to="/recruiter/interviews" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to interviews
        </Link>
      </div>
    );
  }

  const isProposed = interview.status === "proposed";
  const isConfirmed = interview.status === "confirmed";
  const canCancel = isProposed || isConfirmed;

  // Status history chronologically
  const history = Array.isArray(interview.statusHistory)
    ? [...interview.statusHistory].sort(
        (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
      )
    : [];

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/recruiter/interviews"
          style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
        >
          ← Back to interviews
        </Link>
      </div>

      {/* Page Header */}
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 className="page-title">{interview.candidate?.name || "Candidate"}</h1>
          <div style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
            {interview.candidate?.email} · Interview for{" "}
            <strong>{interview.job?.title || "Job"}</strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StatusBadge status={interview.status} />
        </div>
      </div>

      {cancelError && (
        <div className="alert alert-danger" aria-live="polite" style={{ marginBottom: "1.5rem" }}>
          {cancelError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Details & Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Interview Details Card */}
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              Interview Details
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
                  Mode
                </div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, textTransform: "capitalize" }}>
                  {interview.mode}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
                  Created On
                </div>
                <div style={{ fontSize: "0.9375rem" }}>
                  {formatDate(interview.createdAt)}
                </div>
              </div>
            </div>

            {/* Mode-specific connection info */}
            {interview.mode === "online" && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
                  Meeting Link
                </div>
                <div>
                  {interview.meetingLink && isValidHttpUrl(interview.meetingLink) ? (
                    <a
                      href={interview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-accent)",
                        fontSize: "0.9375rem",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {interview.meetingLink} ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)" }}>
                      {interview.meetingLink || "No link specified"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {interview.mode === "onsite" && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
                  Office Location
                </div>
                <div style={{ fontSize: "0.9375rem", color: "var(--color-text)" }}>
                  {interview.location || "Office address not specified"}
                </div>
              </div>
            )}

            {interview.notes && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
                  Notes for Candidate
                </div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    lineHeight: 1.5,
                    color: "var(--color-text)",
                    whiteSpace: "pre-line",
                    margin: 0,
                  }}
                >
                  {interview.notes}
                </p>
              </div>
            )}

            {/* Confirmed Slot (if confirmed) */}
            {isConfirmed && interview.selectedSlot && (
              <div
                style={{
                  backgroundColor: "#f0fdfa",
                  border: "1px solid #99f6e4",
                  borderRadius: "var(--radius-btn)",
                  padding: "12px 16px",
                  marginTop: "0.5rem",
                }}
              >
                <div style={{ fontSize: "0.8125rem", color: "var(--color-accent)", fontWeight: 600, marginBottom: "4px" }}>
                  Confirmed Interview Time
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text)" }}>
                  {formatSlotRange(interview.selectedSlot.start, interview.selectedSlot.end)}
                </div>
              </div>
            )}
          </div>

          {/* Proposed Slots Card */}
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Proposed Slots
            </h2>
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Slots offered to candidate in order of proposal:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {Array.isArray(interview.proposedSlots) &&
                interview.proposedSlots.map((slot, idx) => {
                  const isChosen =
                    isConfirmed &&
                    interview.selectedSlot &&
                    new Date(interview.selectedSlot.start).getTime() === new Date(slot.start).getTime();

                  return (
                    <div
                      key={slot._id || idx}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-btn)",
                        border: "1px solid",
                        borderColor: isChosen ? "var(--color-accent)" : "var(--color-border)",
                        backgroundColor: isChosen ? "#f0fdfa" : "var(--color-card)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "0.9375rem" }}>
                        {formatSlotRange(slot.start, slot.end)}
                      </span>
                      {isChosen && (
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent)" }}>
                          Selected by candidate
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Cancellation Actions */}
          {canCancel && (
            <div className="card" style={{ margin: 0 }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                Manage Interview
              </h2>
              <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
                If you need to reschedule or cancel this interview session, cancel it below. The candidate
                will be notified.
              </p>

              {!confirmCancel ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ color: "var(--color-error)", borderColor: "var(--color-border)" }}
                  onClick={handleOpenCancelConfirm}
                  disabled={cancelling}
                >
                  Cancel interview
                </button>
              ) : (
                <div className="inline-confirm">
                  <span className="confirm-text" aria-live="polite">
                    Are you sure you want to cancel this interview?
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
                    onClick={handleCancelInterview}
                    disabled={cancelling}
                  >
                    {cancelling ? "Cancelling..." : "Yes, cancel interview"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleCloseCancelConfirm}
                    disabled={cancelling}
                  >
                    Keep interview
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Status History Timeline */}
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
            Status History
          </h2>

          {history.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
              No history recorded.
            </p>
          ) : (
            <div className="timeline">
              {history.map((item, idx) => {
                // Requirement 9: Show status history without names when changedBy is not populated
                const changedByName =
                  item.changedBy && typeof item.changedBy === "object"
                    ? item.changedBy.name
                    : null;

                return (
                  <div key={item._id || idx} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="timeline-time">
                        {formatDate(item.changedAt)}
                      </div>
                      {changedByName && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                          Changed by {changedByName}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}