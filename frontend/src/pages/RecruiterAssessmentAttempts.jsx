import React, { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Submitted", value: "submitted" },
  { label: "Graded", value: "graded" },
];

export default function RecruiterAssessmentAttempts() {
  const { assessmentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status") || "";
  const status = ["submitted", "graded"].includes(rawStatus) ? rawStatus : "";

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [assessment, setAssessment] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      client.get(`/assessments/${assessmentId}`, { signal: controller.signal }),
      client.get(`/attempts/assessment/${assessmentId}`, {
        params: { page, limit: 10, status: status || undefined },
        signal: controller.signal,
      }),
    ])
      .then(([assRes, attemptsRes]) => {
        if (assRes.data?.success && assRes.data.assessment) {
          setAssessment(assRes.data.assessment);
        }
        if (attemptsRes.data?.success) {
          setAttempts(attemptsRes.data.attempts || []);
          setTotalPages(attemptsRes.data.pages || 1);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load candidate attempts.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [assessmentId, status, page]);

  const handleTabChange = (newStatus) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus) {
        next.set("status", newStatus);
      } else {
        next.delete("status");
      }
      next.set("page", "1");
      return next;
    });
  };

  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(newPage));
      return next;
    });
  };

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        {assessment?.job?._id ? (
          <Link
            to={`/recruiter/jobs/${assessment.job._id}/assessment`}
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to assessment setup
          </Link>
        ) : (
          <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
            ← Back to jobs
          </Link>
        )}
      </div>

      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title">Candidate attempts</h1>
        {assessment && (
          <p className="page-subtitle">
            {assessment.title} · {assessment.job?.title || "Job opening"}
          </p>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="tabs-bar">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              className={`tab-btn ${isActive ? "active" : ""}`}
              onClick={() => handleTabChange(tab.value)}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && <Loader message="Loading attempts..." />}

      {error && <ErrorMessage message={error} onRetry={fetchData} />}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {attempts.length === 0 ? (
            <div style={{ padding: "2rem" }}>
              <EmptyState
                title="No attempts found"
                description={
                  status
                    ? `No candidate attempts currently marked as "${status}".`
                    : "No candidates have attempted this assessment yet."
                }
              />
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "35%" }}>Candidate</th>
                      <th style={{ width: "20%" }}>Status</th>
                      <th style={{ width: "20%" }}>Score</th>
                      <th style={{ width: "15%" }}>Submitted</th>
                      <th style={{ width: "10%", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((att) => (
                      <tr key={att._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
                            {att.candidate?.name || "Candidate"}
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                            {att.candidate?.email}
                          </div>
                        </td>

                        <td>
                          <StatusBadge status={att.status} />
                        </td>

                        <td>
                          {att.status === "graded" ? (
                            <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>
                              {att.totalScore} / {att.maxScore} pts
                            </span>
                          ) : att.status === "in_progress" ? (
                            <span style={{ color: "var(--color-text-gray)" }}>In progress</span>
                          ) : (
                            <span style={{ color: "var(--color-text-gray)" }}>
                              MCQ: {att.mcqScore} · Review needed
                            </span>
                          )}
                        </td>

                        <td style={{ color: "var(--color-text-gray)", fontSize: "0.8125rem" }}>
                          {att.submittedAt ? formatDate(att.submittedAt) : formatDate(att.startedAt)}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <Link
                            to={`/recruiter/attempts/${att._id}`}
                            className="btn btn-outline btn-sm"
                          >
                            {att.status === "submitted" ? "Grade" : "View"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "1rem" }}>
                <Pagination page={page} pages={totalPages} onPageChange={handlePageChange} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
