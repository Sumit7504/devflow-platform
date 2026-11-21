import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";

export default function CandidateAttemptList() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAttempts = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client
      .get("/attempts/my", { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.attempts)) {
          setAttempts(res.data.attempts);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load assessments.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchAttempts();
    return cleanup;
  }, []);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">My assessments</h1>
          <p className="page-subtitle">View and complete skill tests for positions you have applied to.</p>
        </div>
        <Link to="/candidate/jobs" className="btn btn-outline">
          Browse jobs
        </Link>
      </div>

      {loading && <Loader message="Loading assessments..." />}

      {error && <ErrorMessage message={error} onRetry={fetchAttempts} />}

      {!loading && !error && (
        <>
          {attempts.length === 0 ? (
            <EmptyState
              title="No assessments taken"
              description="You have not started or taken any skill assessments yet. Apply to jobs to receive assessment invites."
              actionLink="/candidate/jobs"
              actionText="Browse jobs"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {attempts.map((att) => {
                const isGraded = att.status === "graded";
                const isInProgress = att.status === "in_progress";

                return (
                  <div
                    key={att._id}
                    className="card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      margin: 0,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "4px" }}>
                        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                          {att.assessmentTitle || "Technical Assessment"}
                        </h2>
                        <StatusBadge status={att.status} />
                      </div>

                      <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                        {att.jobTitle || "Job position"} · Started on {formatDate(att.startedAt)}
                      </div>

                      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                        {isGraded ? (
                          <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>
                            Score: {att.totalScore} / {att.maxScore} points
                          </span>
                        ) : isInProgress ? (
                          <span>In progress (time running)</span>
                        ) : (
                          <span>Submitted · Awaiting review</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <Link
                        to={`/candidate/attempts/${att._id}`}
                        className={`btn ${isInProgress ? "btn-primary" : "btn-outline"} btn-sm`}
                      >
                        {isInProgress ? "Continue test" : "View results"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
