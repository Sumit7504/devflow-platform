import React, { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Applied", value: "applied" },
  { label: "Shortlisted", value: "shortlisted" },
  { label: "Rejected", value: "rejected" },
  { label: "Hired", value: "hired" },
];

export default function JobApplicants() {
  const { id } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state validation
  const rawStatus = searchParams.get("status") || "";
  const status = ["applied", "shortlisted", "rejected", "hired"].includes(rawStatus)
    ? rawStatus
    : "";

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [job, setJob] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [applications, setApplications] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalApplicants, setTotalApplicants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active interviews map: { [applicationId]: interviewId }
  const [activeInterviewsMap, setActiveInterviewsMap] = useState({});
  const [interviewLookupError, setInterviewLookupError] = useState(false);

  const fetchActiveInterviews = (signal) => {
    setInterviewLookupError(false);
    client
      .get(`/interviews/recruiter?job=${id}&active=true&limit=50`, { signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.interviews)) {
          const map = {};
          res.data.interviews.forEach((inv) => {
            const appId = (inv.application?._id || inv.application)?.toString();
            if (appId) {
              map[appId] = inv._id;
            }
          });
          setActiveInterviewsMap(map);
        }
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setInterviewLookupError(true);
        }
      });
  };

  const fetchData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    // Fetch active interviews for the job in ONE request per page
    fetchActiveInterviews(controller.signal);

    Promise.all([
      client.get(`/jobs/${id}`, { signal: controller.signal }),
      client.get(`/applications/job/${id}`, {
        params: { page, limit: 10, status: status || undefined },
        signal: controller.signal,
      }),
    ])
      .then(([jobRes, appsRes]) => {
        if (jobRes.data?.success && jobRes.data.job) {
          const j = jobRes.data.job;

          // Ownership check
          const postedById = (j.postedBy?._id || j.postedBy)?.toString();
          const currentUserId = (user?._id || user?.id)?.toString();
          if (postedById && currentUserId && postedById !== currentUserId) {
            setUnauthorized(true);
            return;
          }
          setJob(j);
        }

        if (appsRes.data?.success) {
          setApplications(appsRes.data.applications || []);
          setTotalPages(appsRes.data.pages || 1);
          setTotalApplicants(appsRes.data.total || 0);
        }
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setUnauthorized(true);
        } else {
          const msg = getErrorMessage(err, "Failed to load applicants.");
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
  }, [id, status, page]);

  const handleTabChange = (newStatus) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus) {
        next.set("status", newStatus);
      } else {
        next.delete("status");
      }
      next.set("page", "1"); // Reset to page 1 on tab change
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
            You are not authorized to view applicants for this job posting.
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
      {/* Back Link */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
          ← Back to jobs
        </Link>
      </div>

      {/* Header matching docs/desgin/Recruiter Applicants.png */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title">Applicants</h1>
        {job && (
          <p className="page-subtitle">
            {job.title} · {job.company?.name || "Company"}
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

      {loading && <Loader message="Loading applicants..." />}

      {error && <ErrorMessage message={error} onRetry={fetchData} />}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {applications.length === 0 ? (
            <div style={{ padding: "2rem" }}>
              <EmptyState
                title="No applicants found"
                description={
                  status
                    ? `There are no applicants currently marked as "${status}".`
                    : "No candidates have applied to this job yet."
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
                      <th style={{ width: "25%" }}>Applied</th>
                      <th style={{ width: "20%" }}>Status</th>
                      <th style={{ width: "20%", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr key={app._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
                            {app.candidate?.name || "Anonymous Candidate"}
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                            {app.candidate?.email}
                          </div>
                        </td>

                        <td style={{ color: "var(--color-text-gray)" }}>
                          {formatDate(app.createdAt)}
                        </td>

                        <td>
                          <StatusBadge status={app.status} />
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                            {app.status === "shortlisted" && (
                              interviewLookupError ? (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  style={{ color: "var(--color-error)", borderColor: "var(--color-border)" }}
                                  onClick={() => fetchActiveInterviews()}
                                >
                                  Retry
                                </button>
                              ) : activeInterviewsMap[app._id] ? (
                                <Link
                                  to={`/recruiter/interviews/${activeInterviewsMap[app._id]}`}
                                  className="btn btn-outline btn-sm"
                                >
                                  View interview
                                </Link>
                              ) : (
                                <Link
                                  to={`/recruiter/applications/${app._id}/interview/new`}
                                  className="btn btn-outline btn-sm"
                                >
                                  Schedule interview
                                </Link>
                              )
                            )}
                            <Link
                              to={`/recruiter/applications/${app._id}`}
                              className="btn btn-outline btn-sm"
                            >
                              View application
                            </Link>
                          </div>
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
