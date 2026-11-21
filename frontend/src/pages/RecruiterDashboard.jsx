import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { formatDate, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";

export default function RecruiterDashboard() {
  const [company, setCompany] = useState(null);
  const [hasNoCompany, setHasNoCompany] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setHasNoCompany(false);

    Promise.allSettled([
      client.get("/companies/me", { signal: controller.signal }),
      client.get("/jobs/my", { signal: controller.signal }),
    ])
      .then(([companyRes, jobsRes]) => {
        // Handle company result
        if (companyRes.status === "fulfilled" && companyRes.value.data?.success) {
          setCompany(companyRes.value.data.company);
        } else if (
          companyRes.status === "rejected" &&
          companyRes.reason?.response?.status === 404
        ) {
          // 404 from /companies/me strictly means no company created yet
          setHasNoCompany(true);
          setCompany(null);
        } else if (companyRes.status === "rejected") {
          const msg = getErrorMessage(companyRes.reason, "Failed to load company profile.");
          if (msg) setError(msg);
        }

        // Handle jobs result
        if (jobsRes.status === "fulfilled" && jobsRes.value.data?.success) {
          setJobs(jobsRes.value.data.jobs || []);
        } else if (jobsRes.status === "rejected") {
          const msg = getErrorMessage(jobsRes.reason, "Failed to load jobs.");
          if (msg) setError(msg);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchDashboardData();
    return cleanup;
  }, []);

  const newestJobs = jobs.slice(0, 3);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Recruiter dashboard</h1>
          <p className="page-subtitle">Manage company details, track job postings, and review applicants.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link to="/recruiter/company" className="btn btn-outline">
            Company profile
          </Link>
          <Link to="/recruiter/jobs/new" className="btn btn-primary">
            Post a job
          </Link>
        </div>
      </div>

      {loading && <Loader message="Loading dashboard..." />}

      {error && <ErrorMessage message={error} onRetry={fetchDashboardData} />}

      {!loading && !error && (
        <>
          {/* Company Status Card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div className="card-header-clean">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Company profile</h2>
              <Link to="/recruiter/company" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                {hasNoCompany ? "Create profile" : "Edit profile"}
              </Link>
            </div>

            {hasNoCompany ? (
              <div
                style={{
                  padding: "1.25rem",
                  backgroundColor: "var(--color-bg)",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: "4px" }}>
                  No company profile set up
                </div>
                <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1rem" }}>
                  You must create a company profile before you can publish job openings and receive applications.
                </p>
                <Link to="/recruiter/company" className="btn btn-primary btn-sm">
                  Set up company profile
                </Link>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
                  {company?.name}
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
                  {[company?.industry, company?.location, company?.size ? `${company.size} employees` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {company?.description && (
                  <p style={{ fontSize: "0.875rem", color: "var(--color-text)", marginTop: "0.75rem", lineHeight: 1.5 }}>
                    {company.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Recent Jobs */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div className="card-header-clean">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Recent job postings</h2>
              {jobs.length > 0 && (
                <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                  View all ({jobs.length})
                </Link>
              )}
            </div>

            {jobs.length === 0 ? (
              <EmptyState
                title="No jobs posted yet"
                description="Start hiring by creating your first job posting."
                actionLink="/recruiter/jobs/new"
                actionText="Post a job"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {newestJobs.map((job) => (
                  <div
                    key={job._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.875rem 1rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text)" }}>
                          {job.title}
                        </span>
                        <StatusBadge status={job.status} />
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginTop: "2px" }}>
                        Posted on {formatDate(job.createdAt)} · {job.location || "Remote"} ·{" "}
                        <span style={{ textTransform: "capitalize" }}>{job.jobType}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <Link to={`/recruiter/jobs/${job._id}/applicants`} className="btn btn-outline btn-sm">
                        Applicants
                      </Link>
                      <Link to={`/recruiter/jobs/${job._id}/edit`} className="btn btn-outline btn-sm">
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
              Quick actions
            </h2>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <Link to="/recruiter/jobs/new" className="btn btn-primary btn-sm">
                + Post new job
              </Link>
              <Link to="/recruiter/jobs" className="btn btn-outline btn-sm">
                Manage all jobs
              </Link>
              <Link to="/recruiter/company" className="btn btn-outline btn-sm">
                Edit company settings
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
