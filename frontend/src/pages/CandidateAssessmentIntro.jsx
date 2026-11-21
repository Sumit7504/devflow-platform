import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";

export default function CandidateAssessmentIntro() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  const fetchData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      client.get(`/assessments/job/${jobId}`, { signal: controller.signal }),
      client.get("/attempts/my", { signal: controller.signal }),
    ])
      .then(([assessmentRes, myAttemptsRes]) => {
        if (assessmentRes.data?.success && assessmentRes.data.assessment) {
          const a = assessmentRes.data.assessment;
          setAssessment(a);

          if (myAttemptsRes.data?.success && Array.isArray(myAttemptsRes.data.attempts)) {
            const matched = myAttemptsRes.data.attempts.find(
              (att) =>
                (att.assessment?._id || att.assessment) === a._id ||
                (att.job?._id || att.job) === jobId
            );
            if (matched) {
              setExistingAttempt(matched);
            }
          }
        }
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setError("No assessment has been created for this position yet.");
        } else if (err.response?.status === 403) {
          setError(
            "You are not authorized to attempt this assessment. Candidates must hold an active (non-rejected) application for this position."
          );
        } else {
          const msg = getErrorMessage(err, "Failed to load assessment information.");
          if (msg) setError(msg);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [jobId]);

  const handleStart = async () => {
    if (!assessment?._id || isStarting) return;
    setIsStarting(true);
    setError(null);

    try {
      const res = await client.post("/attempts/start", { assessmentId: assessment._id });
      if (res.data?.success && res.data.attempt?._id) {
        navigate(`/candidate/attempts/${res.data.attempt._id}`, { replace: true });
      }
    } catch (err) {
      if (err.response?.status === 409) {
        // Attempt already started, fetch my attempts to find it
        try {
          const myRes = await client.get("/attempts/my");
          const matched = myRes.data?.attempts?.find(
            (att) =>
              (att.assessment?._id || att.assessment) === assessment._id ||
              (att.job?._id || att.job) === jobId
          );
          if (matched?._id) {
            navigate(`/candidate/attempts/${matched._id}`, { replace: true });
            return;
          }
        } catch {
          // Ignore secondary fetch failure
        }
        setError("You have already started this assessment.");
      } else {
        const msg = getErrorMessage(err, "Failed to start assessment.");
        if (msg) setError(msg);
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link to={`/candidate/jobs/${jobId}`} style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
          ← Back to job posting
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">Skill assessment</h1>
        <p className="page-subtitle">Test your technical abilities and problem solving skills for this position.</p>
      </div>

      {loading && <Loader message="Loading assessment information..." />}

      {error && (
        <div className="card" style={{ maxWidth: "600px" }}>
          <p style={{ color: "var(--color-text)", fontSize: "0.9375rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
            {error}
          </p>
          <Link to={`/candidate/jobs/${jobId}`} className="btn btn-outline btn-sm">
            Return to job details
          </Link>
        </div>
      )}

      {!loading && !error && assessment && (
        <div className="card" style={{ maxWidth: "640px" }}>
          <h2 style={{ fontSize: "1.375rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {assessment.title}
          </h2>

          {assessment.description && (
            <p style={{ color: "var(--color-text-gray)", fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              {assessment.description}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              padding: "1rem",
              borderRadius: "8px",
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              marginBottom: "1.5rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                Duration
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                {assessment.durationMinutes} minutes
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                Questions & Points
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                {assessment.questions?.length || 0} questions (
                {assessment.questions?.reduce((sum, q) => sum + (q.points || 0), 0)} pts)
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Instructions
            </h3>
            <ul style={{ paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--color-text-gray)", lineHeight: 1.6 }}>
              <li>The timer begins as soon as you click <strong>Start assessment</strong>.</li>
              <li>Multiple choice questions are auto-graded upon submission.</li>
              <li>Code questions are evaluated and graded directly by the hiring team.</li>
              <li>Once submitted, answers cannot be edited.</li>
            </ul>
          </div>

          {existingAttempt ? (
            <div>
              <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
                You have already started this assessment ({existingAttempt.status.replace("_", " ")}).
              </div>
              <Link to={`/candidate/attempts/${existingAttempt._id}`} className="btn btn-primary">
                {existingAttempt.status === "in_progress" ? "Continue assessment →" : "View assessment results →"}
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="btn btn-primary"
              disabled={isStarting}
              style={{ minWidth: "160px" }}
            >
              {isStarting ? "Starting..." : "Start assessment →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
