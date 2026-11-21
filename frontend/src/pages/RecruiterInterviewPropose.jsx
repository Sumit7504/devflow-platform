import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import {
  getUserTimeZone,
  isValidHttpUrl,
  getErrorMessage,
} from "../utils/formatters";

const createInitialSlot = () => ({
  id: "slot_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
  start: "",
  end: "",
});

export default function RecruiterInterviewPropose() {
  const { applicationId } = useParams();
  const navigate = useNavigate();

  const [application, setApplication] = useState(null);
  const [existingActiveInterview, setExistingActiveInterview] = useState(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [appError, setAppError] = useState(null);

  // Form fields
  const [mode, setMode] = useState("online");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState([createInitialSlot()]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [slotErrors, setSlotErrors] = useState({}); // { [slotIndex]: string }

  // Unsaved changes tracking
  const isDirtyRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  // Time zone description
  const userTz = getUserTimeZone();
  const tzAbbr = (() => {
    try {
      const parts = new Intl.DateTimeFormat(undefined, {
        timeZoneName: "short",
        timeZone: userTz,
      }).formatToParts(new Date());
      return parts.find((p) => p.type === "timeZoneName")?.value || userTz;
    } catch {
      return userTz;
    }
  })();

  // 1. Fetch application details and check if an active interview already exists
  const fetchApplicationData = (signal) => {
    setLoadingApp(true);
    setAppError(null);
    setExistingActiveInterview(null);

    Promise.all([
      client.get(`/applications/${applicationId}`, { signal }),
      client.get(`/interviews/recruiter?application=${applicationId}&active=true`, { signal }),
    ])
      .then(([appRes, intRes]) => {
        if (appRes.data?.success && appRes.data.application) {
          setApplication(appRes.data.application);
        }
        if (intRes.data?.success && Array.isArray(intRes.data.interviews) && intRes.data.interviews.length > 0) {
          setExistingActiveInterview(intRes.data.interviews[0]);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load application details.");
        if (msg) setAppError(msg);
      })
      .finally(() => {
        setLoadingApp(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchApplicationData(controller.signal);
    return () => controller.abort();
  }, [applicationId]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirtyRef.current && !hasSubmittedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const markDirty = () => {
    isDirtyRef.current = true;
  };

  // Clear fields when mode changes (Requirement 8)
  const handleModeChange = (newMode) => {
    markDirty();
    setMode(newMode);
    if (newMode === "online") {
      setLocation("");
    } else if (newMode === "onsite") {
      setMeetingLink("");
    } else if (newMode === "phone") {
      setMeetingLink("");
      setLocation("");
    }
    setFieldErrors((prev) => ({
      ...prev,
      mode: "",
      meetingLink: "",
      location: "",
    }));
  };

  // Dynamic slot management with stable keys (Requirement 8)
  const handleAddSlot = () => {
    if (slots.length >= 5) return;
    markDirty();
    setSlots((prev) => [...prev, createInitialSlot()]);
  };

  const handleRemoveSlot = (index) => {
    if (slots.length <= 1) return;
    markDirty();
    setSlots((prev) => prev.filter((_, idx) => idx !== index));
    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleSlotChange = (index, field, value) => {
    markDirty();
    setSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setSlotErrors((prev) => ({ ...prev, [index]: "" }));
  };

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    setSlotErrors({});

    // Client checks (convenience hints)
    const errors = {};
    const slotErrs = {};

    if (mode === "online") {
      if (!meetingLink.trim()) {
        errors.meetingLink = "meetingLink is required for online interviews";
      } else if (!isValidHttpUrl(meetingLink.trim())) {
        errors.meetingLink = "meetingLink must be a valid URL (include http:// or https://)";
      }
    } else if (mode === "onsite") {
      if (!location.trim()) {
        errors.location = "location is required for onsite interviews";
      }
    }

    if (notes.length > 1000) {
      errors.notes = "notes cannot exceed 1000 characters";
    }

    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 5) {
      errors.slots = "slots must be between 1 and 5 items";
    }

    // Convert datetime-local strings to ISO UTC
    const parsedSlots = [];
    const nowMs = Date.now();

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.start || !s.end) {
        slotErrs[i] = "Both start and end dates/times are required.";
        continue;
      }

      const startDate = new Date(s.start);
      const endDate = new Date(s.end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        slotErrs[i] = "Please enter valid dates and times.";
        continue;
      }

      if (startDate.getTime() <= nowMs) {
        slotErrs[i] = "Start time must be in the future.";
        continue;
      }

      if (endDate.getTime() <= startDate.getTime()) {
        slotErrs[i] = "End time must be after the start time.";
        continue;
      }

      const durationMins = (endDate.getTime() - startDate.getTime()) / (60 * 1000);
      if (durationMins < 15 || durationMins > 240) {
        slotErrs[i] = "Duration must be between 15 and 240 minutes.";
        continue;
      }

      parsedSlots.push({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      });
    }

    if (Object.keys(errors).length > 0 || Object.keys(slotErrs).length > 0) {
      setFieldErrors(errors);
      setSlotErrors(slotErrs);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        applicationId,
        mode,
        slots: parsedSlots,
        notes: notes.trim(),
      };
      if (mode === "online") payload.meetingLink = meetingLink.trim();
      if (mode === "onsite") payload.location = location.trim();

      const res = await client.post("/interviews", payload);

      if (res.data?.success) {
        hasSubmittedRef.current = true;
        isDirtyRef.current = false;
        navigate("/recruiter/interviews");
      }
    } catch (err) {
      if (err.response?.status === 422 && Array.isArray(err.response.data?.errors)) {
        const backendFieldErrors = {};
        const backendSlotErrors = {};

        err.response.data.errors.forEach(({ field, message }) => {
          if (field.startsWith("slots[")) {
            // slots[0].start -> extract slot index
            const match = field.match(/slots\[(\d+)\]/);
            if (match) {
              backendSlotErrors[parseInt(match[1], 10)] = message;
            }
          } else {
            backendFieldErrors[field] = message;
          }
        });
        setFieldErrors(backendFieldErrors);
        setSlotErrors(backendSlotErrors);
      } else {
        const errorMsg = getErrorMessage(err, "Failed to propose interview.");
        setFormError(errorMsg);

        // Show overlap error next to the matching slot row if detected (Requirement 7)
        if (errorMsg) {
          const singleSlotMatch = errorMsg.match(/Proposed slot (\d+) overlaps/i);
          if (singleSlotMatch) {
            const slotNum = parseInt(singleSlotMatch[1], 10) - 1;
            setSlotErrors((prev) => ({
              ...prev,
              [slotNum]: errorMsg,
            }));
          }
          const dualSlotMatch = errorMsg.match(/Proposed slots (\d+) and (\d+) overlap/i);
          if (dualSlotMatch) {
            const slotA = parseInt(dualSlotMatch[1], 10) - 1;
            const slotB = parseInt(dualSlotMatch[2], 10) - 1;
            setSlotErrors((prev) => ({
              ...prev,
              [slotA]: `Overlaps with slot ${slotB + 1}`,
              [slotB]: `Overlaps with slot ${slotA + 1}`,
            }));
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingApp) {
    return <Loader message="Loading application details..." />;
  }

  if (appError) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to="/recruiter/jobs"
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to jobs
          </Link>
        </div>
        <ErrorMessage
          message={appError}
          onRetry={() => {
            const controller = new AbortController();
            fetchApplicationData(controller.signal);
          }}
        />
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

  // Active interview guard
  if (existingActiveInterview) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to={`/recruiter/applications/${applicationId}`}
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to application
          </Link>
        </div>
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Interview already scheduled
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            An active interview ({existingActiveInterview.status}) already exists for{" "}
            <strong>{application.candidate?.name || "this candidate"}</strong>.
          </p>
          <Link
            to={`/recruiter/interviews/${existingActiveInterview._id}`}
            className="btn btn-primary btn-sm"
          >
            View existing interview
          </Link>
        </div>
      </div>
    );
  }

  // Shortlisted guard
  if (application.status !== "shortlisted") {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to={`/recruiter/applications/${applicationId}`}
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to application
          </Link>
        </div>
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Cannot schedule interview
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Candidate must be in <strong>shortlisted</strong> status before scheduling an interview.
            Current status: <strong>{application.status}</strong>.
          </p>
          <Link
            to={`/recruiter/applications/${applicationId}`}
            className="btn btn-primary btn-sm"
          >
            View application
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to={`/recruiter/applications/${applicationId}`}
          style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
        >
          ← Back to application
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">Propose Interview</h1>
        <p className="page-subtitle">
          Propose interview slots for <strong>{application.candidate?.name || "Candidate"}</strong>{" "}
          applied to <strong>{application.job?.title}</strong>.
        </p>
      </div>

      {formError && (
        <div className="alert alert-danger" aria-live="polite">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          {/* Mode Selector */}
          <div className="form-group">
            <label className="form-label" htmlFor="mode-select">
              Interview Mode
            </label>
            <select
              id="mode-select"
              className={`form-control ${fieldErrors.mode ? "is-invalid" : ""}`}
              value={mode}
              onChange={(e) => handleModeChange(e.target.value)}
              aria-describedby={fieldErrors.mode ? "mode-error" : undefined}
            >
              <option value="online">Online (Video Meeting)</option>
              <option value="onsite">Onsite (In-person)</option>
              <option value="phone">Phone Call</option>
            </select>
            {fieldErrors.mode && (
              <span id="mode-error" className="field-error" aria-live="polite">
                {fieldErrors.mode}
              </span>
            )}
          </div>

          {/* Meeting Link (for Online) */}
          {mode === "online" && (
            <div className="form-group">
              <label className="form-label" htmlFor="meeting-link-input">
                Meeting Link <span style={{ color: "var(--color-error)" }}>*</span>
              </label>
              <input
                id="meeting-link-input"
                type="url"
                className={`form-control ${fieldErrors.meetingLink ? "is-invalid" : ""}`}
                placeholder="https://meet.google.com/xyz or https://zoom.us/j/..."
                value={meetingLink}
                onChange={(e) => {
                  markDirty();
                  setMeetingLink(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, meetingLink: "" }));
                }}
                aria-describedby={fieldErrors.meetingLink ? "meeting-link-error" : undefined}
              />
              {fieldErrors.meetingLink && (
                <span id="meeting-link-error" className="field-error" aria-live="polite">
                  {fieldErrors.meetingLink}
                </span>
              )}
            </div>
          )}

          {/* Location (for Onsite) */}
          {mode === "onsite" && (
            <div className="form-group">
              <label className="form-label" htmlFor="location-input">
                Office Location / Room <span style={{ color: "var(--color-error)" }}>*</span>
              </label>
              <input
                id="location-input"
                type="text"
                className={`form-control ${fieldErrors.location ? "is-invalid" : ""}`}
                placeholder="e.g. 100 Main St, 4th Floor, Room 402"
                value={location}
                onChange={(e) => {
                  markDirty();
                  setLocation(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, location: "" }));
                }}
                aria-describedby={fieldErrors.location ? "location-error" : undefined}
              />
              {fieldErrors.location && (
                <span id="location-error" className="field-error" aria-live="polite">
                  {fieldErrors.location}
                </span>
              )}
            </div>
          )}

          {/* Notes (Optional) */}
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className="form-label" htmlFor="notes-input" style={{ margin: 0 }}>
                Notes / Instructions for candidate (optional)
              </label>
              <span style={{ fontSize: "0.75rem", color: notes.length > 1000 ? "var(--color-error)" : "var(--color-text-gray)" }}>
                {notes.length} / 1000
              </span>
            </div>
            <textarea
              id="notes-input"
              className={`form-control ${fieldErrors.notes ? "is-invalid" : ""}`}
              style={{ minHeight: "80px", height: "auto", padding: "10px 14px", resize: "vertical" }}
              placeholder="e.g. Please have your resume and code samples ready. The interview will be 45 minutes."
              value={notes}
              maxLength={1000}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
                setFieldErrors((prev) => ({ ...prev, notes: "" }));
              }}
              aria-describedby={fieldErrors.notes ? "notes-error" : undefined}
            />
            {fieldErrors.notes && (
              <span id="notes-error" className="field-error" aria-live="polite">
                {fieldErrors.notes}
              </span>
            )}
          </div>
        </div>

        {/* Proposed Slots Section */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
              Proposed Slots (1 to 5)
            </h2>
            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-gray)",
                marginTop: "4px",
                backgroundColor: "var(--color-bg)",
                padding: "8px 12px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--color-border)",
              }}
            >
              Times are entered in your local time zone: <strong>{userTz} ({tzAbbr})</strong>.
              The system will automatically convert them to UTC.
            </div>
          </div>

          {fieldErrors.slots && (
            <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
              {fieldErrors.slots}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {slots.map((slot, index) => {
              const err = slotErrors[index];
              const startId = `slot_start_${slot.id}`;
              const endId = `slot_end_${slot.id}`;
              const errId = `slot_err_${slot.id}`;

              return (
                <div
                  key={slot.id}
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-btn)",
                    backgroundColor: "var(--color-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                      Slot {index + 1}
                    </span>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: "2px 8px", fontSize: "0.75rem", color: "var(--color-error)", borderColor: "var(--color-border)" }}
                        onClick={() => handleRemoveSlot(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label htmlFor={startId} style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                        Start Time
                      </label>
                      <input
                        id={startId}
                        type="datetime-local"
                        className={`form-control ${err ? "is-invalid" : ""}`}
                        value={slot.start}
                        onChange={(e) => handleSlotChange(index, "start", e.target.value)}
                        aria-describedby={err ? errId : undefined}
                      />
                    </div>

                    <div>
                      <label htmlFor={endId} style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                        End Time
                      </label>
                      <input
                        id={endId}
                        type="datetime-local"
                        className={`form-control ${err ? "is-invalid" : ""}`}
                        value={slot.end}
                        onChange={(e) => handleSlotChange(index, "end", e.target.value)}
                        aria-describedby={err ? errId : undefined}
                      />
                    </div>
                  </div>

                  {err && (
                    <span id={errId} className="field-error" aria-live="polite" style={{ marginTop: "6px" }}>
                      {err}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {slots.length < 5 && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginTop: "1rem" }}
              onClick={handleAddSlot}
            >
              + Add another slot (up to 5)
            </button>
          )}
        </div>

        {/* Form Actions */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "Sending invitation..." : "Propose Interview"}
          </button>
          <Link
            to={`/recruiter/applications/${applicationId}`}
            className="btn btn-outline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}