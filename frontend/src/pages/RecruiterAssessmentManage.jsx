import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";

const genId = () => Math.random().toString(36).substring(2, 9);

export default function RecruiterAssessmentManage() {
  const { id: jobId } = useParams();
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [attemptsExist, setAttemptsExist] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questions, setQuestions] = useState([
    {
      id: genId(),
      type: "mcq",
      text: "",
      points: 1,
      options: [
        { id: genId(), text: "" },
        { id: genId(), text: "" },
      ],
      correctOption: 0,
    },
  ]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  // Delete inline confirmation
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOpenerRef = useRef(null);

  const fetchAssessmentData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    setSuccessMessage("");
    setIsDirty(false);

    // 1. Verify job ownership
    client
      .get(`/jobs/${jobId}`, { signal: controller.signal })
      .then((jobRes) => {
        if (jobRes.data?.success && jobRes.data.job) {
          const j = jobRes.data.job;
          const postedById = (j.postedBy?._id || j.postedBy)?.toString();
          const currentUserId = (user?._id || user?.id)?.toString();

          if (postedById && currentUserId && postedById !== currentUserId) {
            setUnauthorized(true);
            setLoading(false);
            return;
          }
          setJob(j);

          // 2. Fetch assessment for this job
          client
            .get(`/assessments/job/${jobId}`, { signal: controller.signal })
            .then(async (assRes) => {
              if (assRes.data?.success && assRes.data.assessment) {
                const a = assRes.data.assessment;
                setAssessment(a);
                setIsCreateMode(false);
                setTitle(a.title || "");
                setDescription(a.description || "");
                setDurationMinutes(a.durationMinutes || 30);

                // Reconstruct questions with stable keys
                if (Array.isArray(a.questions) && a.questions.length > 0) {
                  setQuestions(
                    a.questions.map((q) => ({
                      id: q._id ? q._id.toString() : genId(),
                      type: q.type,
                      text: q.text || "",
                      points: q.points || 1,
                      options: Array.isArray(q.options)
                        ? q.options.map((opt) => ({ id: genId(), text: opt }))
                        : [{ id: genId(), text: "" }, { id: genId(), text: "" }],
                      correctOption: Number.isInteger(q.correctOption) ? q.correctOption : 0,
                    }))
                  );
                }

                // 3. Check if attempts already exist for this assessment
                try {
                  const attRes = await client.get(`/attempts/assessment/${a._id}?limit=1`, {
                    signal: controller.signal,
                  });
                  if (attRes.data?.total > 0 || attRes.data?.attempts?.length > 0) {
                    setAttemptsExist(true);
                  }
                } catch {
                  // Ignore
                }
              }
            })
            .catch((assErr) => {
              if (assErr.response?.status === 404) {
                // Strictly treat 404 from /assessments/job/:jobId as no assessment created yet
                setIsCreateMode(true);
                setAssessment(null);
                setAttemptsExist(false);
              } else {
                const msg = getErrorMessage(assErr, "Failed to load assessment.");
                if (msg) setError(msg);
              }
            })
            .finally(() => {
              setLoading(false);
            });
        }
      })
      .catch((jobErr) => {
        if (jobErr.response?.status === 403) {
          setUnauthorized(true);
        } else {
          const msg = getErrorMessage(jobErr, "Failed to load job details.");
          if (msg) setError(msg);
        }
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchAssessmentData();
    return cleanup;
  }, [jobId]);

  // Warn on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty && !isSubmitting) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isSubmitting]);

  // ── Question manipulation helpers ──────────────────────────────────────────
  const handleAddQuestion = () => {
    if (questions.length >= 50) return;
    setIsDirty(true);
    setQuestions((prev) => [
      ...prev,
      {
        id: genId(),
        type: "mcq",
        text: "",
        points: 1,
        options: [
          { id: genId(), text: "" },
          { id: genId(), text: "" },
        ],
        correctOption: 0,
      },
    ]);
  };

  const handleRemoveQuestion = (idx) => {
    if (questions.length <= 1) return;
    setIsDirty(true);
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveQuestion = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleQuestionChange = (idx, field, value) => {
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const current = { ...copy[idx] };

      if (field === "type") {
        current.type = value;
        if (value === "code") {
          // Drop options and correctOption when switching to code
          delete current.options;
          delete current.correctOption;
        } else if (value === "mcq") {
          current.options = [
            { id: genId(), text: "" },
            { id: genId(), text: "" },
          ];
          current.correctOption = 0;
        }
      } else {
        current[field] = value;
      }

      copy[idx] = current;
      return copy;
    });
  };

  const handleAddOption = (qIdx) => {
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIdx] };
      if (!Array.isArray(q.options) || q.options.length >= 6) return prev;
      q.options = [...q.options, { id: genId(), text: "" }];
      copy[qIdx] = q;
      return copy;
    });
  };

  const handleRemoveOption = (qIdx, optIdx) => {
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIdx] };
      if (!Array.isArray(q.options) || q.options.length <= 2) return prev;

      q.options = q.options.filter((_, i) => i !== optIdx);

      // Keep correctOption index in sync
      if (q.correctOption === optIdx) {
        q.correctOption = 0;
      } else if (q.correctOption > optIdx) {
        q.correctOption = q.correctOption - 1;
      }

      copy[qIdx] = q;
      return copy;
    });
  };

  const handleOptionTextChange = (qIdx, optIdx, text) => {
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIdx] };
      q.options = q.options.map((opt, i) => (i === optIdx ? { ...opt, text } : opt));
      copy[qIdx] = q;
      return copy;
    });
  };

  const handleSetCorrectOption = (qIdx, optIdx) => {
    setIsDirty(true);
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIdx] };
      q.correctOption = optIdx;
      copy[qIdx] = q;
      return copy;
    });
  };

  // ── Form submission ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setError(null);
    setSuccessMessage("");

    // Client-side validations
    const clientErrors = {};
    if (!title.trim()) clientErrors.title = "Assessment title is required";
    const durationNum = parseInt(durationMinutes, 10);
    if (!durationNum || durationNum < 1 || durationNum > 180) {
      clientErrors.durationMinutes = "durationMinutes must be an integer between 1 and 180";
    }

    if (!attemptsExist) {
      if (questions.length < 1 || questions.length > 50) {
        clientErrors.questions = "questions must contain between 1 and 50 items";
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.text.trim()) {
          clientErrors[`questions_${i}_text`] = `Question ${i + 1} text is required`;
        }
        if (q.type === "mcq") {
          if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
            clientErrors[`questions_${i}_options`] = `Question ${i + 1} must have 2 to 6 options`;
          } else {
            for (let j = 0; j < q.options.length; j++) {
              if (!q.options[j].text.trim()) {
                clientErrors[`questions_${i}_opt_${j}`] = `Option ${j + 1} cannot be empty`;
              }
            }
          }
        }
      }
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setIsSubmitting(true);

    // Build payload matching exact backend schema
    let payload;
    if (isCreateMode) {
      payload = {
        jobId,
        title: title.trim(),
        description: description.trim(),
        durationMinutes: durationNum,
        questions: questions.map((q) => {
          if (q.type === "mcq") {
            return {
              type: "mcq",
              text: q.text.trim(),
              points: Math.max(1, parseInt(q.points, 10) || 1),
              options: q.options.map((opt) => opt.text.trim()),
              correctOption: q.correctOption,
            };
          }
          return {
            type: "code",
            text: q.text.trim(),
            points: Math.max(1, parseInt(q.points, 10) || 1),
          };
        }),
      };
    } else {
      // Edit mode
      if (attemptsExist) {
        // Only update title and description when attempts exist
        payload = {
          title: title.trim(),
          description: description.trim(),
        };
      } else {
        payload = {
          title: title.trim(),
          description: description.trim(),
          durationMinutes: durationNum,
          questions: questions.map((q) => {
            if (q.type === "mcq") {
              return {
                type: "mcq",
                text: q.text.trim(),
                points: Math.max(1, parseInt(q.points, 10) || 1),
                options: q.options.map((opt) => opt.text.trim()),
                correctOption: q.correctOption,
              };
            }
            return {
              type: "code",
              text: q.text.trim(),
              points: Math.max(1, parseInt(q.points, 10) || 1),
            };
          }),
        };
      }
    }

    try {
      if (isCreateMode) {
        const res = await client.post("/assessments", payload);
        if (res.data?.success && res.data.assessment) {
          setIsCreateMode(false);
          setAssessment(res.data.assessment);
          setSuccessMessage("Assessment created successfully.");
          setIsDirty(false);
        }
      } else {
        const res = await client.put(`/assessments/${assessment._id}`, payload);
        if (res.data?.success && res.data.assessment) {
          setAssessment(res.data.assessment);
          setSuccessMessage("Assessment updated successfully.");
          setIsDirty(false);
        }
      }
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;

        if (status === 422 && Array.isArray(data.errors)) {
          const mapped = {};
          data.errors.forEach((e) => {
            mapped[e.field] = e.message;
          });
          setFieldErrors(mapped);
        } else if (status === 409) {
          setAttemptsExist(true);
          setError(
            data.message ||
              "Candidate attempts exist for this assessment. Questions and duration can no longer be modified, but you may update the title and description."
          );
        } else {
          setError(data.message || "Failed to save assessment.");
        }
      } else {
        setError("Unable to reach server. Please check your network connection.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteConfirm = (e) => {
    deleteOpenerRef.current = e.currentTarget;
    setIsConfirmingDelete(true);
    setError(null);
  };

  const handleCancelDelete = () => {
    setIsConfirmingDelete(false);
    if (deleteOpenerRef.current) {
      deleteOpenerRef.current.focus();
    }
  };

  const handleConfirmDelete = async () => {
    if (!assessment?._id || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const res = await client.delete(`/assessments/${assessment._id}`);
      if (res.data?.success) {
        setIsCreateMode(true);
        setAssessment(null);
        setAttemptsExist(false);
        setIsConfirmingDelete(false);
        setSuccessMessage("Assessment deleted successfully.");
        // Reset to clean template
        setTitle("");
        setDescription("");
        setDurationMinutes(30);
        setQuestions([
          {
            id: genId(),
            type: "mcq",
            text: "",
            points: 1,
            options: [
              { id: genId(), text: "" },
              { id: genId(), text: "" },
            ],
            correctOption: 0,
          },
        ]);
        setIsDirty(false);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setError("Cannot delete assessment because candidate attempts exist.");
      } else {
        const msg = getErrorMessage(err, "Failed to delete assessment.");
        if (msg) setError(msg);
      }
      setIsConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
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
            You can only create or manage assessments for your own job postings.
          </p>
          <Link to="/recruiter/jobs" className="btn btn-outline btn-sm">
            Back to my jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
          ← Back to jobs
        </Link>
      </div>

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">
            {isCreateMode ? "Create skill assessment" : "Manage assessment"}
          </h1>
          {job && (
            <p className="page-subtitle">
              {job.title} · {job.company?.name || "Company"}
            </p>
          )}
        </div>

        {assessment && (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <Link
              to={`/recruiter/assessments/${assessment._id}/attempts`}
              className="btn btn-outline btn-sm"
            >
              Candidate attempts
            </Link>

            {!isConfirmingDelete ? (
              <button
                type="button"
                onClick={handleOpenDeleteConfirm}
                className="btn btn-outline btn-sm"
                style={{ color: "var(--color-error)", borderColor: "var(--color-error-border)" }}
                disabled={isSubmitting || isDeleting}
              >
                Delete assessment
              </button>
            ) : (
              <div className="inline-confirm">
                <span className="confirm-text" aria-live="polite">
                  Delete assessment?
                </span>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="btn btn-primary btn-sm"
                  style={{ backgroundColor: "var(--color-error)", height: "30px", padding: "0 10px" }}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="btn btn-outline btn-sm"
                  style={{ height: "30px", padding: "0 10px" }}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && <Loader message="Loading assessment..." />}

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && (
        <div className="card" style={{ maxWidth: "800px" }}>
          {attemptsExist && (
            <div className="alert alert-warning" style={{ marginBottom: "1.5rem" }}>
              Candidate attempts already exist for this assessment. Questions and duration can no
              longer be modified to preserve scoring integrity, but you can update the title and
              description.
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="title">
                Assessment title *
              </label>
              <input
                id="title"
                type="text"
                className={`form-control ${fieldErrors.title ? "is-invalid" : ""}`}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="e.g. Frontend Engineering Coding & MCQ Test"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">
                Description & Instructions
              </label>
              <textarea
                id="description"
                className={`form-control ${fieldErrors.description ? "is-invalid" : ""}`}
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Brief guidelines for the candidate..."
                disabled={isSubmitting}
                style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
              />
              {fieldErrors.description && (
                <span className="field-error">{fieldErrors.description}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="durationMinutes">
                Duration (minutes) *
              </label>
              <input
                id="durationMinutes"
                type="number"
                min={1}
                max={180}
                className={`form-control ${fieldErrors.durationMinutes ? "is-invalid" : ""}`}
                value={durationMinutes}
                onChange={(e) => {
                  setDurationMinutes(e.target.value);
                  setIsDirty(true);
                }}
                disabled={isSubmitting || attemptsExist}
                style={{ maxWidth: "200px" }}
                required
              />
              {fieldErrors.durationMinutes && (
                <span className="field-error">{fieldErrors.durationMinutes}</span>
              )}
            </div>

            {/* Questions Section */}
            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                  Questions ({questions.length})
                </h2>

                {!attemptsExist && questions.length < 50 && (
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="btn btn-outline btn-sm"
                    disabled={isSubmitting}
                  >
                    + Add question
                  </button>
                )}
              </div>

              {fieldErrors.questions && (
                <div className="field-error" style={{ marginBottom: "1rem" }}>
                  {fieldErrors.questions}
                </div>
              )}

              {questions.map((q, qIdx) => (
                <div
                  key={q.id}
                  style={{
                    padding: "1.25rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    backgroundColor: "var(--color-bg)",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                        Question {qIdx + 1}
                      </span>
                      <select
                        className="form-control"
                        value={q.type}
                        onChange={(e) => handleQuestionChange(qIdx, "type", e.target.value)}
                        disabled={isSubmitting || attemptsExist}
                        style={{ height: "32px", fontSize: "0.8125rem", padding: "0 8px" }}
                      >
                        <option value="mcq">Multiple Choice (MCQ)</option>
                        <option value="code">Code Implementation</option>
                      </select>
                    </div>

                    {!attemptsExist && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleMoveQuestion(qIdx, -1)}
                          disabled={qIdx === 0 || isSubmitting}
                          style={{ height: "28px", padding: "0 8px", fontSize: "0.75rem" }}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleMoveQuestion(qIdx, 1)}
                          disabled={qIdx === questions.length - 1 || isSubmitting}
                          style={{ height: "28px", padding: "0 8px", fontSize: "0.75rem" }}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          disabled={questions.length <= 1 || isSubmitting}
                          style={{ height: "28px", padding: "0 8px", fontSize: "0.75rem", color: "var(--color-error)" }}
                          title="Remove question"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Question prompt *</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={q.text}
                      onChange={(e) => handleQuestionChange(qIdx, "text", e.target.value)}
                      placeholder="Write the question or code challenge description..."
                      disabled={isSubmitting || attemptsExist}
                      style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                      required
                    />
                    {fieldErrors[`questions_${qIdx}_text`] && (
                      <span className="field-error">{fieldErrors[`questions_${qIdx}_text`]}</span>
                    )}
                  </div>

                  <div className="form-group" style={{ maxWidth: "160px" }}>
                    <label className="form-label">Points *</label>
                    <input
                      type="number"
                      min={1}
                      className="form-control"
                      value={q.points}
                      onChange={(e) => handleQuestionChange(qIdx, "points", parseInt(e.target.value, 10) || 1)}
                      disabled={isSubmitting || attemptsExist}
                      style={{ height: "36px" }}
                      required
                    />
                  </div>

                  {/* MCQ Options with radio selector */}
                  {q.type === "mcq" && Array.isArray(q.options) && (
                    <div style={{ marginTop: "1rem" }}>
                      <label className="form-label" style={{ marginBottom: "0.5rem" }}>
                        Answer options (mark the correct choice)
                      </label>

                      {q.options.map((opt, optIdx) => (
                        <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                          <input
                            type="radio"
                            name={`correct_${q.id}`}
                            checked={q.correctOption === optIdx}
                            onChange={() => handleSetCorrectOption(qIdx, optIdx)}
                            disabled={isSubmitting || attemptsExist}
                            title="Mark as correct answer"
                            style={{ cursor: "pointer", accentColor: "var(--color-accent)" }}
                          />
                          <input
                            type="text"
                            className="form-control"
                            value={opt.text}
                            onChange={(e) => handleOptionTextChange(qIdx, optIdx, e.target.value)}
                            placeholder={`Option ${optIdx + 1}`}
                            disabled={isSubmitting || attemptsExist}
                            style={{ height: "36px", flex: 1 }}
                            required
                          />
                          {!attemptsExist && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleRemoveOption(qIdx, optIdx)}
                              disabled={q.options.length <= 2 || isSubmitting}
                              style={{ height: "36px", padding: "0 10px", fontSize: "0.75rem" }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}

                      {!attemptsExist && q.options.length < 6 && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleAddOption(qIdx)}
                          style={{ height: "30px", fontSize: "0.75rem", marginTop: "4px" }}
                          disabled={isSubmitting}
                        >
                          + Add option
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Saving..."
                  : isCreateMode
                  ? "Create assessment"
                  : "Save assessment changes"}
              </button>

              <Link to="/recruiter/jobs" className="btn btn-outline">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
