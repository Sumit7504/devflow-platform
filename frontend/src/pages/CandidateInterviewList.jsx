import React, { useState, useEffect, useRef } from "react";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import {
  formatSlotRange,
  isSlotInPast,
  isValidHttpUrl,
  getErrorMessage,
  formatDate,
} from "../utils/formatters";

export default function CandidateInterviewList() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-interview selected slot index in proposedSlots: { [interviewId]: originalIndex }
  const [selectedSlots, setSelectedSlots] = useState({});

  // In-flight request tracking: { [interviewId]: boolean }
  const [processingId, setProcessingId] = useState(null);

  // Per-interview error message banner: { [interviewId]: string }
  const [actionErrors, setActionErrors] = useState({});

  // Inline decline confirmation: null | interviewId
  const [confirmDeclineId, setConfirmDeclineId] = useState(null);
  const declineOpenerRef = useRef(null);

  // Double submit ref guard
  const submittingRef = useRef(false);

  const fetchInterviews = (signal) => {
    setLoading(true);
    setError(null);

    client
      .get("/interviews/my", { signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.interviews)) {
          setInterviews(res.data.interviews);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load interviews.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchInterviews(controller.signal);
    return () => controller.abort();
  }, []);

  const handleSelectSlot = (interviewId, originalIndex) => {
    setSelectedSlots((prev) => ({
      ...prev,
      [interviewId]: originalIndex,
    }));
    // Clear any previous error on slot pick
    setActionErrors((prev) => ({ ...prev, [interviewId]: "" }));
  };

  const handleConfirmSlot = async (interview) => {
    const interviewId = interview._id;
    const slotIdx = selectedSlots[interviewId];

    if (slotIdx === undefined || slotIdx === null) {
      setActionErrors((prev) => ({
        ...prev,
        [interviewId]: "Please select an available interview slot.",
      }));
      return;
    }

    if (submittingRef.current || processingId) return;
    submittingRef.current = true;
    setProcessingId(interviewId);
    setActionErrors((prev) => ({ ...prev, [interviewId]: "" }));

    try {
      const res = await client.patch(`/interviews/${interviewId}/confirm`, {
        slotIndex: slotIdx,
      });

      if (res.data?.success) {
        // Refetch list immediately to obtain updated populated fields
        fetchInterviews();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to confirm interview slot.");
      setActionErrors((prev) => ({
        ...prev,
        [interviewId]: msg,
      }));

      // Refetch on 400 or 409 per requirement (client time checks are hints)
      if (err.response?.status === 400 || err.response?.status === 409) {
        fetchInterviews();
      }
    } finally {
      submittingRef.current = false;
      setProcessingId(null);
    }
  };

  const handleOpenDecline = (interviewId, e) => {
    declineOpenerRef.current = e.currentTarget;
    setConfirmDeclineId(interviewId);
    setActionErrors((prev) => ({ ...prev, [interviewId]: "" }));
  };

  const handleCancelDecline = () => {
    setConfirmDeclineId(null);
    if (declineOpenerRef.current) {
      declineOpenerRef.current.focus();
    }
  };

  const handleDecline = async (interviewId) => {
    if (submittingRef.current || processingId) return;
    submittingRef.current = true;
    setProcessingId(interviewId);
    setActionErrors((prev) => ({ ...prev, [interviewId]: "" }));

    try {
      const res = await client.patch(`/interviews/${interviewId}/decline`);
      if (res.data?.success) {
        setConfirmDeclineId(null);
        // Refetch full list
        fetchInterviews();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to decline interview.");
      setActionErrors((prev) => ({
        ...prev,
        [interviewId]: msg,
      }));

      if (err.response?.status === 400 || err.response?.status === 409) {
        fetchInterviews();
      }
    } finally {
      submittingRef.current = false;
      setProcessingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Interviews</h1>
        <p className="page-subtitle">
          Manage your interview invitations and confirmed schedule.
        </p>
      </div>

      {loading && <Loader message="Loading your interviews..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchInterviews(controller.signal);
          }}
        />
      )}

      {!loading && !error && interviews.length === 0 && (
        <div className="card">
          <EmptyState
            title="No interviews scheduled"
            description="When recruiters shortlist your applications and propose interview dates, they will appear here."
          />
        </div>
      )}

      {!loading && !error && interviews.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {interviews.map((interview) => {
            const isProposed = interview.status === "proposed";
            const isConfirmed = interview.status === "confirmed";
            const isDeclined = interview.status === "declined";
            const isCancelled = interview.status === "cancelled";

            const isProcessing = processingId === interview._id;
            const actionError = actionErrors[interview._id];

            // Slots analysis
            const slots = Array.isArray(interview.proposedSlots)
              ? interview.proposedSlots
              : [];
            const futureSlots = slots.filter((s) => !isSlotInPast(s.start));
            const allSlotsPassed = isProposed && slots.length > 0 && futureSlots.length === 0;

            const selectedOriginalIdx = selectedSlots[interview._id];

            return (
              <div key={interview._id} className="card" style={{ margin: 0 }}>
                {/* Header: Title, Company, Mode, Status */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {interview.job?.title || "Job Interview"}
                    </h2>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--color-text-gray)",
                        marginTop: "2px",
                      }}
                    >
                      {interview.job?.company?.name || "Company"} ·{" "}
                      <span style={{ textTransform: "capitalize" }}>
                        {interview.mode || "Online"} interview
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <StatusBadge status={interview.status} />
                  </div>
                </div>

                {/* Optional Recruiter Notes */}
                {interview.notes && (
                  <div
                    style={{
                      backgroundColor: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-btn)",
                      padding: "10px 14px",
                      fontSize: "0.875rem",
                      color: "var(--color-text)",
                      marginBottom: "1rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-line",
                    }}
                  >
                    <strong>Notes from recruiter:</strong> {interview.notes}
                  </div>
                )}

                {/* Inline Action Error Alert */}
                {actionError && (
                  <div
                    className="alert alert-danger"
                    aria-live="polite"
                    style={{ marginBottom: "1rem" }}
                  >
                    {actionError}
                  </div>
                )}

                {/* Proposed State: Slot choices */}
                {isProposed && (
                  <div>
                    <fieldset className="slots-fieldset">
                      <legend className="slots-legend">
                        Select an interview slot (in your local time):
                      </legend>

                      {allSlotsPassed ? (
                        <div
                          style={{
                            padding: "12px",
                            backgroundColor: "var(--color-bg)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-btn)",
                            fontSize: "0.875rem",
                            color: "var(--color-error)",
                            marginBottom: "1rem",
                          }}
                        >
                          All proposed slots have already passed. Please decline this
                          interview or contact the recruiter.
                        </div>
                      ) : (
                        slots.map((slot, originalIdx) => {
                          const passed = isSlotInPast(slot.start);
                          const isSelected = selectedOriginalIdx === originalIdx;
                          const inputId = `slot_${interview._id}_${originalIdx}`;

                          return (
                            <label
                              key={slot._id || originalIdx}
                              htmlFor={inputId}
                              className={`slot-option-card ${isSelected ? "selected" : ""} ${
                                passed ? "disabled" : ""
                              }`}
                            >
                              <input
                                type="radio"
                                id={inputId}
                                name={`slot_${interview._id}`}
                                value={originalIdx}
                                disabled={passed || isProcessing}
                                checked={isSelected}
                                onChange={() => handleSelectSlot(interview._id, originalIdx)}
                                style={{
                                  accentColor: "var(--color-accent)",
                                  cursor: passed ? "not-allowed" : "pointer",
                                }}
                              />
                              <span style={{ fontSize: "0.9375rem" }}>
                                {formatSlotRange(slot.start, slot.end)}
                              </span>
                              {passed && (
                                <span
                                  style={{
                                    fontSize: "0.8125rem",
                                    color: "var(--color-error)",
                                    marginLeft: "auto",
                                  }}
                                >
                                  (This slot has already passed)
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </fieldset>

                    {/* Action buttons */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginTop: "1rem",
                      }}
                    >
                      {!allSlotsPassed && confirmDeclineId !== interview._id && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleConfirmSlot(interview)}
                          disabled={
                            isProcessing ||
                            selectedOriginalIdx === undefined ||
                            selectedOriginalIdx === null
                          }
                        >
                          {isProcessing ? "Confirming..." : "Confirm slot"}
                        </button>
                      )}

                      {confirmDeclineId !== interview._id && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={(e) => handleOpenDecline(interview._id, e)}
                          disabled={isProcessing}
                        >
                          Decline
                        </button>
                      )}

                      {/* Accessible Inline Decline Confirmation */}
                      {confirmDeclineId === interview._id && (
                        <div className="inline-confirm">
                          <span className="confirm-text" aria-live="polite">
                            Are you sure you want to decline this interview?
                          </span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{
                              color: "var(--color-error)",
                              borderColor: "var(--color-error)",
                            }}
                            onClick={() => handleDecline(interview._id)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? "Declining..." : "Yes, decline"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handleCancelDecline}
                            disabled={isProcessing}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirmed State: Details */}
                {isConfirmed && interview.selectedSlot && (
                  <div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        color: "var(--color-text)",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <strong>Confirmed Time:</strong>{" "}
                      {formatSlotRange(
                        interview.selectedSlot.start,
                        interview.selectedSlot.end
                      )}
                    </div>

                    {interview.mode === "online" && (
                      <div style={{ fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                        <strong>Meeting Link:</strong>{" "}
                        {interview.meetingLink && isValidHttpUrl(interview.meetingLink) ? (
                          <a
                            href={interview.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--color-accent)",
                              textDecoration: "underline",
                              wordBreak: "break-all",
                            }}
                          >
                            {interview.meetingLink} ↗
                          </a>
                        ) : (
                          <span style={{ color: "var(--color-text-gray)" }}>
                            {interview.meetingLink || "Link will be shared by recruiter"}
                          </span>
                        )}
                      </div>
                    )}

                    {interview.mode === "onsite" && (
                      <div style={{ fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                        <strong>Location:</strong>{" "}
                        <span>{interview.location || "Office address"}</span>
                      </div>
                    )}

                    {interview.mode === "phone" && (
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          color: "var(--color-text-gray)",
                          marginBottom: "0.5rem",
                        }}
                      >
                        The recruiter will call you at your registered phone number.
                      </div>
                    )}
                  </div>
                )}

                {/* Declined or Cancelled State */}
                {(isDeclined || isCancelled) && (
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--color-text-gray)",
                      paddingTop: "4px",
                    }}
                  >
                    {isDeclined && "You declined this interview invitation."}
                    {isCancelled && "This interview was cancelled by the recruiter."}
                    {interview.updatedAt && (
                      <span style={{ marginLeft: "6px" }}>
                        ({formatDate(interview.updatedAt)})
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}