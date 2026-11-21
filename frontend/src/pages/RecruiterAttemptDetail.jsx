import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";

export default function RecruiterAttemptDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Code question grading inputs: { [questionId]: { pointsAwarded: number, feedback: string } }
  const [grades, setGrades] = useState({});
  const [gradeErrors, setGradeErrors] = useState({});
  const [isGrading, setIsGrading] = useState(false);

  const fetchAttempt = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    client
      .get(`/attempts/${id}`, { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && res.data.attempt) {
          const att = res.data.attempt;

          // Check ownership
          const postedById = (att.assessment?.job?.postedBy?._id || att.assessment?.job?.postedBy)?.toString();
          const currentUserId = (user?._id || user?.id)?.toString();
          if (postedById && currentUserId && postedById !== currentUserId) {
            setUnauthorized(true);
            setLoading(false);
            return;
          }

          setAttempt(att);

          // Populate existing grades for code questions
          const initialGrades = {};
          if (Array.isArray(att.answers)) {
            att.answers.forEach((ans) => {
              const qId = (ans.question?._id || ans.question)?.toString();
              if (qId) {
                initialGrades[qId] = {
                  pointsAwarded: ans.pointsAwarded ?? 0,
                  feedback: ans.feedback || "",
                };
              }
            });
          }
          setGrades(initialGrades);
        }
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setUnauthorized(true);
        } else {
          const msg = getErrorMessage(err, "Failed to load attempt.");
          if (msg) setError(msg);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchAttempt();
    return cleanup;
  }, [id]);

  const handleGradeChange = (questionId, field, value) => {
    setGrades((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
      },
    }));
  };

  const handleSaveGrades = async (e) => {
    e.preventDefault();
    setGradeErrors({});
    setError(null);
    setSuccessMessage("");

    // Identify code questions
    const questions = attempt?.assessment?.questions || [];
    const codeQuestions = questions.filter((q) => q.type === "code");

    if (codeQuestions.length === 0) return;

    // Validate grades: points between 0 and question's points
    const errors = {};
    const gradesPayload = [];

    codeQuestions.forEach((q) => {
      const g = grades[q._id] || { pointsAwarded: 0, feedback: "" };
      const pts = Number(g.pointsAwarded);

      if (isNaN(pts) || pts < 0 || pts > q.points) {
        errors[q._id] = `Points must be between 0 and maximum points (${q.points})`;
      } else {
        gradesPayload.push({
          question: q._id,
          pointsAwarded: pts,
          feedback: typeof g.feedback === "string" ? g.feedback.trim() : "",
        });
      }
    });

    if (Object.keys(errors).length > 0) {
      setGradeErrors(errors);
      return;
    }

    setIsGrading(true);

    try {
      const res = await client.patch(`/attempts/${id}/grade`, { grades: gradesPayload });
      if (res.data?.success) {
        setSuccessMessage("Grades saved successfully.");
        // Refetch attempt to update populated fields and audit details
        fetchAttempt();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to submit grades.");
      if (msg) setError(msg);
    } finally {
      setIsGrading(false);
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
            You are not authorized to view or grade this candidate attempt.
          </p>
          <Link to="/recruiter/jobs" className="btn btn-outline btn-sm">
            Back to my jobs
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loader message="Loading candidate attempt..." />;
  }

  if (error && !attempt) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to jobs
          </Link>
        </div>
        <ErrorMessage message={error} onRetry={fetchAttempt} />
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>Attempt not found.</p>
        <Link to="/recruiter/jobs" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to jobs
        </Link>
      </div>
    );
  }

  const isInProgress = attempt.status === "in_progress";
  const assessment = attempt.assessment || {};
  const questions = assessment.questions || [];
  const codeQuestions = questions.filter((q) => q.type === "code");

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        {assessment._id ? (
          <Link
            to={`/recruiter/assessments/${assessment._id}/attempts`}
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to candidate attempts
          </Link>
        ) : (
          <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to jobs
          </Link>
        )}
      </div>

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">{attempt.candidate?.name || "Candidate Attempt"}</h1>
          <p className="page-subtitle">
            {attempt.candidate?.email} · {assessment.title || "Assessment"} · Started {formatDate(attempt.startedAt)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <StatusBadge status={attempt.status} />
        </div>
      </div>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {isInProgress && (
        <div className="alert alert-warning" style={{ marginBottom: "1.5rem" }}>
          This attempt is currently in progress. Candidates have not yet submitted their responses. Grading is disabled until submission.
        </div>
      )}

      {/* Score Summary Card */}
      <div className="card" style={{ maxWidth: "800px", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Score summary
        </h2>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center", marginTop: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>Total Score</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-accent)" }}>
              {attempt.totalScore} / {attempt.maxScore} pts
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>Auto-graded MCQ</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{attempt.mcqScore} pts</div>
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>Code Score</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{attempt.codeScore} pts</div>
          </div>
        </div>
      </div>

      {/* Question Details and Code Grading Form */}
      <form onSubmit={handleSaveGrades} noValidate style={{ maxWidth: "800px" }}>
        {questions.map((q, idx) => {
          const answerEntry = Array.isArray(attempt.answers)
            ? attempt.answers.find((a) => (a.question?._id || a.question)?.toString() === q._id?.toString())
            : null;

          const isMcq = q.type === "mcq";
          const isCode = q.type === "code";
          const currentGrade = grades[q._id] || { pointsAwarded: 0, feedback: "" };

          return (
            <div key={q._id || idx} className="card" style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, margin: 0 }}>
                    Question {idx + 1} ({isMcq ? "MCQ" : "Code"})
                  </h3>
                  <p style={{ fontSize: "0.9375rem", color: "var(--color-text)", marginTop: "4px", lineHeight: 1.5 }}>
                    {q.text}
                  </p>
                </div>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-gray)", whiteSpace: "nowrap" }}>
                  Max {q.points} {q.points === 1 ? "pt" : "pts"}
                </span>
              </div>

              {/* MCQ Evaluation Display */}
              {isMcq && Array.isArray(q.options) && (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "6px" }}>
                    Options:
                  </div>
                  {q.options.map((opt, optIdx) => {
                    const isCandidateSelected = answerEntry && answerEntry.selectedOption === optIdx;
                    const isCorrect = q.correctOption === optIdx;

                    let bg = "var(--color-card)";
                    let border = "var(--color-border)";
                    let label = "";

                    if (isCorrect && isCandidateSelected) {
                      bg = "#f0fdf4";
                      border = "#86efac";
                      label = "✓ Correct & Selected by candidate";
                    } else if (isCorrect) {
                      bg = "#f0fdfa";
                      border = "#99f6e4";
                      label = "✓ Correct option";
                    } else if (isCandidateSelected) {
                      bg = "var(--color-error-bg)";
                      border = "var(--color-error-border)";
                      label = "✕ Selected by candidate (Incorrect)";
                    }

                    return (
                      <div
                        key={optIdx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: bg,
                          border: `1px solid ${border}`,
                          marginBottom: "6px",
                          fontSize: "0.875rem",
                        }}
                      >
                        <span style={{ fontWeight: isCandidateSelected || isCorrect ? 600 : 400 }}>
                          {opt}
                        </span>
                        {label && (
                          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{label}</span>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
                    Points awarded: <strong>{answerEntry?.pointsAwarded ?? 0} / {q.points}</strong>
                  </div>
                </div>
              )}

              {/* Code Evaluation and Grading Form */}
              {isCode && (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "6px" }}>
                    Candidate's code solution:
                  </div>

                  {answerEntry?.codeAnswer ? (
                    <pre className="code-display" style={{ marginBottom: "1rem" }}>
                      {answerEntry.codeAnswer}
                    </pre>
                  ) : (
                    <div style={{ padding: "12px", backgroundColor: "var(--color-bg)", borderRadius: "8px", fontSize: "0.875rem", color: "var(--color-text-gray)", marginBottom: "1rem" }}>
                      No code submitted for this question.
                    </div>
                  )}

                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                      Grade this solution
                    </h4>

                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "1rem", alignItems: "start" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-text)", marginBottom: "4px" }}>
                          Points (0 - {q.points}) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={q.points}
                          className="form-control"
                          value={currentGrade.pointsAwarded}
                          onChange={(e) => handleGradeChange(q._id, "pointsAwarded", e.target.value)}
                          disabled={isInProgress || isGrading}
                          style={{ height: "36px" }}
                          required
                        />
                        {gradeErrors[q._id] && (
                          <span className="field-error">{gradeErrors[q._id]}</span>
                        )}
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-text)", marginBottom: "4px" }}>
                          Feedback for candidate (optional)
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={currentGrade.feedback}
                          onChange={(e) => handleGradeChange(q._id, "feedback", e.target.value)}
                          placeholder="e.g. Clean solution, good edge-case handling"
                          disabled={isInProgress || isGrading}
                          style={{ height: "36px" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {codeQuestions.length > 0 && !isInProgress && (
          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isGrading}
            >
              {isGrading ? "Saving grades..." : "Save grades"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
