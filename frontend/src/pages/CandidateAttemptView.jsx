import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { getErrorMessage, formatDate } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";
import CountdownTimer from "../components/common/CountdownTimer";

export default function CandidateAttemptView() {
  const { id } = useParams();

  const [attempt, setAttempt] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [questionsError, setQuestionsError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-progress test state
  const [answers, setAnswers] = useState({}); // { [questionId]: { selectedOption, codeAnswer } }
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const submitOpenerRef = useRef(null);

  const fetchAttemptData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuestionsError("");

    client
      .get(`/attempts/${id}`, { signal: controller.signal })
      .then((attemptRes) => {
        if (attemptRes.data?.success && attemptRes.data.attempt) {
          const att = attemptRes.data.attempt;
          setAttempt(att);

          // Compute server clock offset from response Date header
          const serverDateHeader = attemptRes.headers?.date || attemptRes.headers?.get?.("date");
          if (serverDateHeader) {
            const serverMs = new Date(serverDateHeader).getTime();
            if (!isNaN(serverMs)) {
              setServerOffset(serverMs - Date.now());
            }
          }

          // Pre-populate any existing answers stored in the attempt
          if (Array.isArray(att.answers)) {
            const initialMap = {};
            att.answers.forEach((ans) => {
              const qId = (ans.question?._id || ans.question)?.toString();
              if (qId) {
                initialMap[qId] = {
                  selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
                  codeAnswer: ans.codeAnswer || "",
                };
              }
            });
            setAnswers(initialMap);
          }

          // Fetch questions from assessment endpoint
          const assessmentId = att.assessment?._id || att.assessment;
          if (assessmentId) {
            client
              .get(`/assessments/${assessmentId}`, { signal: controller.signal })
              .then((assRes) => {
                if (assRes.data?.success && assRes.data.assessment) {
                  setAssessment(assRes.data.assessment);
                }
              })
              .catch((assErr) => {
                if (assErr.response?.status === 403) {
                  setQuestionsError("Questions could not be loaded because application status is rejected.");
                } else {
                  setQuestionsError(getErrorMessage(assErr, "Unable to load assessment questions."));
                }
              });
          }
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load attempt.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchAttemptData();
    return cleanup;
  }, [id]);

  // Warn on page unload only while in_progress and not currently submitting
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (attempt?.status === "in_progress" && !isSubmittingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [attempt?.status]);

  const handleSelectOption = (questionId, optionIdx) => {
    if (attempt?.status !== "in_progress" || isSubmittingRef.current) return;
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        selectedOption: optionIdx,
      },
    }));
  };

  const handleCodeChange = (questionId, text) => {
    if (attempt?.status !== "in_progress" || isSubmittingRef.current) return;
    if (text.length > 10000) return; // strict character limit
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        codeAnswer: text,
      },
    }));
  };

  const executeSubmit = async () => {
    if (isSubmittingRef.current) return; // double-submit guard
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    // Format answers: send ONLY answered questions, NEVER send points or scores
    const formattedAnswers = [];
    if (assessment?.questions) {
      assessment.questions.forEach((q) => {
        const entry = answers[q._id];
        if (!entry) return;

        if (q.type === "mcq" && Number.isInteger(entry.selectedOption)) {
          formattedAnswers.push({
            question: q._id,
            selectedOption: entry.selectedOption,
          });
        } else if (q.type === "code" && typeof entry.codeAnswer === "string" && entry.codeAnswer.trim().length > 0) {
          formattedAnswers.push({
            question: q._id,
            codeAnswer: entry.codeAnswer,
          });
        }
      });
    }

    try {
      const res = await client.post(`/attempts/${id}/submit`, { answers: formattedAnswers });
      if (res.data?.success && res.data.attempt) {
        setAttempt(res.data.attempt);
        setIsConfirmingSubmit(false);
      }
    } catch (err) {
      if (err.response?.status === 400) {
        // Expired or already submitted
        fetchAttemptData();
      } else {
        const msg = getErrorMessage(err, "Failed to submit assessment.");
        if (msg) setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenConfirm = (e) => {
    submitOpenerRef.current = e.currentTarget;
    setIsConfirmingSubmit(true);
  };

  const handleCancelConfirm = () => {
    setIsConfirmingSubmit(false);
    if (submitOpenerRef.current) {
      submitOpenerRef.current.focus();
    }
  };

  if (loading) {
    return <Loader message="Loading assessment..." />;
  }

  if (error && !attempt) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/candidate/attempts" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to assessments
          </Link>
        </div>
        <ErrorMessage message={error} onRetry={fetchAttemptData} />
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>Assessment attempt not found.</p>
        <Link to="/candidate/attempts" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to assessments
        </Link>
      </div>
    );
  }

  const isInProgress = attempt.status === "in_progress";
  const questions = assessment?.questions || [];

  // Count answered questions
  const answeredCount = questions.filter((q) => {
    const a = answers[q._id];
    if (!a) return false;
    if (q.type === "mcq") return Number.isInteger(a.selectedOption);
    if (q.type === "code") return typeof a.codeAnswer === "string" && a.codeAnswer.trim().length > 0;
    return false;
  }).length;

  return (
    <div>
      {/* Top Header / Status bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div>
          <Link to="/candidate/attempts" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to my assessments
          </Link>
          <h1 className="page-title" style={{ marginTop: "0.5rem" }}>
            {assessment?.title || "Assessment"}
          </h1>
          {isInProgress ? (
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginTop: "2px" }}>
              Answers are kept in your browser session until submitted. Refreshing or navigating away will discard unsaved answers.
            </p>
          ) : (
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginTop: "2px" }}>
              Submitted on {formatDate(attempt.submittedAt || attempt.updatedAt)}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isInProgress ? (
            <>
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", fontWeight: 500 }}>
                Question {answeredCount} of {questions.length}
              </span>
              <CountdownTimer
                deadline={attempt.deadline}
                serverOffset={serverOffset}
                onExpire={executeSubmit}
              />
            </>
          ) : (
            <StatusBadge status={attempt.status} />
          )}
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {questionsError && (
        <div className="alert alert-warning" style={{ marginBottom: "1.5rem" }}>
          {questionsError}
        </div>
      )}

      {/* ── Test Mode (In Progress) ── */}
      {isInProgress && (
        <div>
          {questions.map((q, idx) => {
            const currentAnswer = answers[q._id] || {};

            return (
              <div key={q._id} className="card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                    Question {idx + 1}
                  </h2>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                    {q.points} {q.points === 1 ? "point" : "points"}
                    {q.type === "code" && " · reviewed by the recruiter"}
                  </span>
                </div>

                <p style={{ fontSize: "0.9375rem", color: "var(--color-text)", lineHeight: 1.6, marginBottom: "1.25rem", whiteSpace: "pre-line" }}>
                  {q.text}
                </p>

                {/* MCQ Options */}
                {q.type === "mcq" && Array.isArray(q.options) && (
                  <div>
                    {q.options.map((opt, optIdx) => {
                      const isSelected = currentAnswer.selectedOption === optIdx;
                      return (
                        <label
                          key={optIdx}
                          className={`option-box ${isSelected ? "selected" : ""}`}
                          onClick={() => handleSelectOption(q._id, optIdx)}
                        >
                          <input
                            type="radio"
                            name={`q_${q._id}`}
                            checked={isSelected}
                            onChange={() => handleSelectOption(q._id, optIdx)}
                            disabled={isSubmitting}
                          />
                          <span style={{ fontSize: "0.9375rem", color: "var(--color-text)" }}>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Code Editor */}
                {q.type === "code" && (
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px" }}>
                      Your answer
                    </label>
                    <textarea
                      className="code-textarea"
                      value={currentAnswer.codeAnswer || ""}
                      onChange={(e) => handleCodeChange(q._id, e.target.value)}
                      placeholder="Write your code solution here..."
                      disabled={isSubmitting}
                      rows={6}
                    />
                    <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
                      {(currentAnswer.codeAnswer || "").length} / 10000 characters
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Submission Bar */}
          <div
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "2rem",
              padding: "1.25rem 1.5rem",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
              You cannot change answers after submitting.
            </span>

            {!isConfirmingSubmit ? (
              <button
                type="button"
                onClick={handleOpenConfirm}
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                Submit assessment
              </button>
            ) : (
              <div className="inline-confirm">
                <span className="confirm-text" aria-live="polite">
                  Are you sure? You cannot change answers after submitting.
                </span>
                <button
                  type="button"
                  onClick={executeSubmit}
                  className="btn btn-primary btn-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Yes, Submit"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelConfirm}
                  className="btn btn-outline btn-sm"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Result Mode (Submitted or Graded) ── */}
      {!isInProgress && (
        <div style={{ maxWidth: "760px" }}>
          {/* Summary Score Card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Assessment results
            </h2>

            {attempt.status === "graded" ? (
              <div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-accent)", marginBottom: "0.5rem" }}>
                  {attempt.totalScore} / {attempt.maxScore} points
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
                  MCQ Score: {attempt.mcqScore} pts · Code Score: {attempt.codeScore} pts
                </div>
              </div>
            ) : (
              <div>
                <div className="alert alert-warning" style={{ margin: "0.5rem 0 1rem" }}>
                  Waiting for the recruiter to review code answers.
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
                  Auto-graded MCQ Score: {attempt.mcqScore} pts
                </div>
              </div>
            )}
          </div>

          {/* Candidate Submitted Answers & Feedback Review */}
          {questions.map((q, idx) => {
            const answerEntry = Array.isArray(attempt.answers)
              ? attempt.answers.find((a) => (a.question?._id || a.question)?.toString() === q._id?.toString())
              : null;

            return (
              <div key={q._id || idx} className="card" style={{ marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                      Question {idx + 1} ({q.type.toUpperCase()})
                    </h3>
                    <p style={{ fontSize: "0.9375rem", color: "var(--color-text)", marginTop: "4px", lineHeight: 1.5 }}>
                      {q.text}
                    </p>
                  </div>

                  {attempt.status === "graded" && (
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }}>
                      {answerEntry?.pointsAwarded ?? 0} / {q.points} pts
                    </span>
                  )}
                </div>

                <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                    Your submitted answer:
                  </div>

                  {q.type === "mcq" ? (
                    <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                      {answerEntry && Number.isInteger(answerEntry.selectedOption) && q.options
                        ? `${q.options[answerEntry.selectedOption] || "Selected option " + answerEntry.selectedOption}`
                        : "No answer submitted"}
                    </div>
                  ) : (
                    <div>
                      {answerEntry?.codeAnswer ? (
                        <pre className="code-display">{answerEntry.codeAnswer}</pre>
                      ) : (
                        <span style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
                          No code answer submitted
                        </span>
                      )}
                    </div>
                  )}

                  {/* Recruiter Feedback */}
                  {answerEntry?.feedback && (
                    <div style={{ marginTop: "0.75rem", padding: "8px 12px", borderRadius: "6px", backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", fontWeight: 600 }}>
                        Recruiter Feedback:
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "var(--color-text)", marginTop: "2px" }}>
                        {answerEntry.feedback}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
