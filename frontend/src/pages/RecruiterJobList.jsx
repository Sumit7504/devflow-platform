import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { formatSalary, formatDeadline, formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";

export default function RecruiterJobList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Single active inline close confirmation
  const [confirmCloseJobId, setConfirmCloseJobId] = useState(null);
  const [closingJobId, setClosingJobId] = useState(null);
  const cancelOpenerRef = useRef(null);

  const fetchJobs = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client
      .get("/jobs/my", { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.jobs)) {
          setJobs(res.data.jobs);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load jobs.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchJobs();
    return cleanup;
  }, []);

  const handleOpenCloseConfirm = (jobId, e) => {
    cancelOpenerRef.current = e.currentTarget;
    setConfirmCloseJobId(jobId);
    setSuccessMessage("");
  };

  const handleCancelClose = () => {
    setConfirmCloseJobId(null);
    if (cancelOpenerRef.current) {
      cancelOpenerRef.current.focus();
    }
  };

  const handleConfirmClose = async (jobId) => {
    setClosingJobId(jobId);
    setError(null);

    try {
      const res = await client.patch(`/jobs/${jobId}/close`);
      if (res.data?.success) {
        setJobs((prev) =>
          prev.map((j) => (j._id === jobId ? { ...j, status: "closed" } : j))
        );
        setSuccessMessage("Job closed successfully. Applications will no longer be accepted.");
        setConfirmCloseJobId(null);
      }
    } catch (err) {
      if (err.response?.status === 400) {
        // "Job is already closed"
        setJobs((prev) =>
          prev.map((j) => (j._id === jobId ? { ...j, status: "closed" } : j))
        );
        setSuccessMessage("Job is already closed.");
        setConfirmCloseJobId(null);
      } else {
        const msg = getErrorMessage(err, "Failed to close job.");
        if (msg) setError(msg);
      }
    } finally {
      setClosingJobId(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Manage jobs</h1>
          <p className="page-subtitle">View and manage all job openings posted by your organization.</p>
        </div>
        <Link to="/recruiter/jobs/new" className="btn btn-primary">
          Post a job
        </Link>
      </div>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {error && <ErrorMessage message={error} onRetry={fetchJobs} />}

      {loading && <Loader message="Loading jobs..." />}

      {!loading && !error && (
        <>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs posted yet"
              description="You have not created any job listings. Post an opening to start receiving applicants."
              actionLink="/recruiter/jobs/new"
              actionText="Post your first job"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {jobs.map((job) => {
                const salaryStr = formatSalary(job.salaryMin, job.salaryMax);
                const deadlineStr = job.deadline ? formatDeadline(job.deadline) : "";
                const isConfirming = confirmCloseJobId === job._id;
                const isClosing = closingJobId === job._id;

                return (
                  <div
                    key={job._id}
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
                          {job.title}
                        </h2>
                        <StatusBadge status={job.status} />
                      </div>

                      <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                        {job.location || "Remote"} ·{" "}
                        <span style={{ textTransform: "capitalize" }}>{job.jobType}</span>
                        {salaryStr && ` · ${salaryStr}`}
                        {deadlineStr && ` · Deadline ${deadlineStr}`}
                      </div>

                      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                        Posted on {formatDate(job.createdAt)}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <Link to={`/recruiter/jobs/${job._id}/applicants`} className="btn btn-outline btn-sm">
                        Applicants
                      </Link>

                      <Link to={`/recruiter/jobs/${job._id}/edit`} className="btn btn-outline btn-sm">
                        Edit
                      </Link>

                      {job.status === "open" && !isConfirming && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenCloseConfirm(job._id, e)}
                          className="btn btn-outline btn-sm"
                          disabled={Boolean(confirmCloseJobId)}
                        >
                          Close job
                        </button>
                      )}

                      {isConfirming && (
                        <div className="inline-confirm">
                          <span className="confirm-text" aria-live="polite">
                            Close this job? Applications will stop.
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmClose(job._id)}
                            className="btn btn-primary btn-sm"
                            style={{ height: "30px", padding: "0 10px" }}
                            disabled={isClosing}
                          >
                            {isClosing ? "Closing..." : "Yes, close"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelClose}
                            className="btn btn-outline btn-sm"
                            style={{ height: "30px", padding: "0 10px" }}
                            disabled={isClosing}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
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
