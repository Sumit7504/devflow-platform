import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import { getErrorMessage, formatDate } from "../utils/formatters";

export default function AdminJobList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Validate URL query parameters
  const rawStatus = searchParams.get("status") || "";
  const status = ["open", "closed"].includes(rawStatus) ? rawStatus : "";

  const rawSearch = searchParams.get("search") || "";
  const initialSearch = rawSearch.slice(0, 100);

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  // Local search text for debouncing (~400 ms)
  const [typedSearch, setTypedSearch] = useState(initialSearch);

  // Job data from backend
  const [jobs, setJobs] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Success alert
  const [successMessage, setSuccessMessage] = useState("");

  // Action states: null | { type: "close" | "delete", jobId: string, title: string }
  const [confirmAction, setConfirmAction] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [conflictHint, setConflictHint] = useState("");
  const openerRef = useRef(null);
  const inFlightRef = useRef(false);

  // Debounce search input (Requirement 11)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = typedSearch.trim().slice(0, 100);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (trimmed) {
          next.set("search", trimmed);
        } else {
          next.delete("search");
        }
        next.delete("page");
        return next;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [typedSearch, setSearchParams]);

  useEffect(() => {
    setTypedSearch(initialSearch);
  }, [rawSearch]);

  const fetchJobs = (signal) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "10");
    if (status) params.set("status", status);
    if (initialSearch.trim()) params.set("search", initialSearch.trim());

    client
      .get(`/admin/jobs?${params.toString()}`, { signal })
      .then((res) => {
        if (res.data?.success) {
          setJobs(res.data.jobs || []);
          setTotalPages(res.data.totalPages || 1);
          setCurrentPage(res.data.currentPage || 1);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load jobs.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchJobs(controller.signal);
    return () => controller.abort();
  }, [page, status, initialSearch]);

  const handleStatusFilterChange = (newStatus) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus) {
        next.set("status", newStatus);
      } else {
        next.delete("status");
      }
      next.delete("page");
      return next;
    });
  };

  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage > 1) {
        next.set("page", newPage.toString());
      } else {
        next.delete("page");
      }
      return next;
    });
  };

  const handleOpenConfirm = (type, job, e) => {
    openerRef.current = e.currentTarget;
    setConfirmAction({ type, jobId: job._id, title: job.title });
    setActionError("");
    setConflictHint("");
  };

  const handleCloseConfirm = () => {
    setConfirmAction(null);
    setActionError("");
    setConflictHint("");
    if (openerRef.current) {
      openerRef.current.focus();
    }
  };

  const handleCloseJob = async (jobId, title) => {
    if (inFlightRef.current || processingId) return;
    inFlightRef.current = true;
    setProcessingId(jobId);
    setActionError("");
    setConflictHint("");

    try {
      const res = await client.patch(`/admin/jobs/${jobId}/close`);
      if (res.data?.success) {
        setConfirmAction(null);
        setSuccessMessage(`Job "${title}" has been closed.`);
        fetchJobs();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to close job.");
      setActionError(msg);
    } finally {
      inFlightRef.current = false;
      setProcessingId(null);
    }
  };

  const handleDeleteJob = async (jobId, title) => {
    if (inFlightRef.current || processingId) return;
    inFlightRef.current = true;
    setProcessingId(jobId);
    setActionError("");
    setConflictHint("");

    try {
      const res = await client.delete(`/admin/jobs/${jobId}`);
      if (res.data?.success) {
        setConfirmAction(null);
        setSuccessMessage(`Job "${title}" was permanently deleted.`);

        // Requirement 7: After deleting the last row on a page, go to previous page!
        if (currentPage > 1 && jobs.length === 1) {
          handlePageChange(currentPage - 1);
        } else {
          fetchJobs();
        }
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to delete job.");
      setActionError(msg);

      // On 409 Conflict, suggest closing instead
      if (err.response?.status === 409) {
        setConflictHint("Jobs with existing applications or assessment attempts cannot be deleted. You can Close the job instead.");
      }
    } finally {
      inFlightRef.current = false;
      setProcessingId(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Job Management</h1>
          <p className="page-subtitle">Inspect, close, and manage job postings across all recruiters.</p>
        </div>

        <Link to="/admin" className="btn btn-outline btn-sm">
          ← Back to Overview
        </Link>
      </div>

      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
          {successMessage}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Title Search */}
        <div style={{ flex: "1 1 240px" }}>
          <label htmlFor="job-search-input" className="sr-only" style={{ display: "none" }}>
            Search jobs
          </label>
          <input
            id="job-search-input"
            type="text"
            className="form-control"
            placeholder="Search by job title..."
            maxLength={100}
            value={typedSearch}
            onChange={(e) => setTypedSearch(e.target.value.slice(0, 100))}
          />
        </div>

        {/* Status Filter */}
        <div style={{ minWidth: "150px" }}>
          <label htmlFor="job-status-select" className="sr-only" style={{ display: "none" }}>
            Filter by status
          </label>
          <select
            id="job-status-select"
            className="form-control"
            value={status}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {loading && <Loader message="Loading jobs..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchJobs(controller.signal);
          }}
        />
      )}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {jobs.length === 0 ? (
            <div style={{ padding: "2rem" }}>
              <EmptyState
                title="No jobs found"
                description={
                  initialSearch || status
                    ? "No jobs match your search or status filter."
                    : "No jobs have been posted yet."
                }
              />
            </div>
          ) : (
            <>
              {/* Responsive table container (Requirement 10) */}
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "30%" }}>Job Title</th>
                      <th style={{ width: "25%" }}>Company</th>
                      <th style={{ width: "12%" }}>Status</th>
                      <th style={{ width: "15%" }}>Posted Date</th>
                      <th style={{ width: "18%", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const isOpen = job.status === "open";
                      const isProcessingThisRow = processingId === job._id;
                      const isConfirmingThisRow = confirmAction?.jobId === job._id;

                      return (
                        <tr key={job._id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
                              {job.title}
                            </div>
                            {job.jobType && (
                              <div style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", textTransform: "capitalize" }}>
                                {job.jobType.replace("-", " ")}
                              </div>
                            )}
                          </td>

                          <td style={{ color: "var(--color-text-gray)" }}>
                            {job.company?.name || "Company"}
                          </td>

                          <td>
                            <StatusBadge status={job.status} />
                          </td>

                          <td style={{ color: "var(--color-text-gray)" }}>
                            {formatDate(job.createdAt)}
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                              {!isConfirmingThisRow && (
                                <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                                  {isOpen && (
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={(e) => handleOpenConfirm("close", job, e)}
                                      disabled={processingId !== null}
                                    >
                                      Close
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    style={{ color: "var(--color-error)", borderColor: "var(--color-border)" }}
                                    onClick={(e) => handleOpenConfirm("delete", job, e)}
                                    disabled={processingId !== null}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}

                              {/* Inline Confirmation Prompt */}
                              {isConfirmingThisRow && (
                                <div
                                  className="inline-confirm"
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                    alignItems: "flex-end",
                                    textAlign: "right",
                                  }}
                                >
                                  <span className="confirm-text" aria-live="polite" style={{ fontSize: "0.8125rem" }}>
                                    {confirmAction.type === "close"
                                      ? `Close "${job.title}"?`
                                      : `Permanently delete "${job.title}"?`}
                                  </span>

                                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                    {confirmAction.type === "close" ? (
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleCloseJob(job._id, job.title)}
                                        disabled={isProcessingThisRow}
                                      >
                                        {isProcessingThisRow ? "Closing..." : "Yes, close job"}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
                                        onClick={() => handleDeleteJob(job._id, job.title)}
                                        disabled={isProcessingThisRow}
                                      >
                                        {isProcessingThisRow ? "Deleting..." : "Yes, delete job"}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={handleCloseConfirm}
                                      disabled={isProcessingThisRow}
                                    >
                                      Cancel
                                    </button>
                                  </div>

                                  {actionError && (
                                    <span className="field-error" aria-live="polite" style={{ fontSize: "0.8125rem", maxWidth: "260px" }}>
                                      {actionError}
                                    </span>
                                  )}
                                  {conflictHint && (
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-gray)", maxWidth: "260px", marginTop: "2px" }}>
                                      {conflictHint}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Shared Pagination component (Requirement 3) */}
              <div style={{ padding: "1rem" }}>
                <Pagination
                  page={currentPage}
                  pages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}