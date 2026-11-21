import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import { formatSalary, formatDeadline, getErrorMessage } from "../utils/formatters";
import { useDebounce } from "../hooks/useDebounce";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import Pagination from "../components/common/Pagination";

const VALID_JOB_TYPES = ["full-time", "part-time", "internship", "contract"];

export default function JobList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Validate and parse searchParams with defaults
  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawLimit = parseInt(searchParams.get("limit"), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : 10;

  const urlJobType = searchParams.get("jobType") || "";
  const jobType = VALID_JOB_TYPES.includes(urlJobType) ? urlJobType : "";

  const location = searchParams.get("location") || "";
  const urlKeyword = searchParams.get("keyword") || "";

  // Keep typed keyword in local state for smooth typing
  const [typedKeyword, setTypedKeyword] = useState(urlKeyword);
  const debouncedKeyword = useDebounce(typedKeyword, 400);

  // Sync typedKeyword if URL keyword changes externally (back/forward navigation)
  useEffect(() => {
    setTypedKeyword(urlKeyword);
  }, [urlKeyword]);

  // When debounced keyword changes, write to URL and reset to page 1
  useEffect(() => {
    if (debouncedKeyword !== urlKeyword) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedKeyword.trim()) {
          next.set("keyword", debouncedKeyword.trim());
        } else {
          next.delete("keyword");
        }
        next.set("page", "1");
        return next;
      });
    }
  }, [debouncedKeyword, urlKeyword, setSearchParams]);

  const [jobs, setJobs] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = {
      page,
      limit,
    };
    if (urlKeyword.trim()) params.keyword = urlKeyword.trim();
    if (location.trim()) params.location = location.trim();
    if (jobType) params.jobType = jobType;

    client
      .get("/jobs", { params, signal: controller.signal })
      .then((res) => {
        if (res.data?.success) {
          setJobs(res.data.jobs || []);
          setTotalPages(res.data.pages || 1);
          setTotalJobs(res.data.total || 0);
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
  }, [page, limit, urlKeyword, location, jobType]);

  const handleLocationChange = (e) => {
    const val = e.target.value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val.trim()) {
        next.set("location", val.trim());
      } else {
        next.delete("location");
      }
      next.set("page", "1");
      return next;
    });
  };

  const handleJobTypeChange = (e) => {
    const val = e.target.value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (VALID_JOB_TYPES.includes(val)) {
        next.set("jobType", val);
      } else {
        next.delete("jobType");
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
      <div className="page-header">
        <h1 className="page-title">Find jobs</h1>
        <p className="page-subtitle">Open positions from verified companies.</p>
      </div>

      {/* Filter Row matching docs/desgin/Candidate Browse jobs.png */}
      <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px", gap: "1rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          className="form-control"
          placeholder="Job title or keyword"
          value={typedKeyword}
          onChange={(e) => setTypedKeyword(e.target.value)}
        />
        <input
          type="text"
          className="form-control"
          placeholder="Location"
          value={location}
          onChange={handleLocationChange}
        />
        <select
          className="form-control"
          value={jobType}
          onChange={handleJobTypeChange}
          style={{ cursor: "pointer" }}
        >
          <option value="">All types</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="internship">Internship</option>
          <option value="contract">Contract</option>
        </select>
      </div>

      {loading && <Loader message="Searching jobs..." />}

      {error && <ErrorMessage message={error} onRetry={fetchJobs} />}

      {!loading && !error && (
        <>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs found"
              description="No open positions match your current search filters. Try clearing your filters or using different keywords."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {jobs.map((job) => {
                const salaryStr = formatSalary(job.salaryMin, job.salaryMax);
                const deadlineStr = job.deadline ? formatDeadline(job.deadline) : "";

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
                      <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text)", marginBottom: "4px" }}>
                        {job.title}
                      </h2>
                      <div style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", marginBottom: "4px" }}>
                        {job.company?.name || "Company"} · {job.location || "Remote"}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                        <span style={{ textTransform: "capitalize" }}>{job.jobType}</span>
                        {salaryStr && ` · ${salaryStr}`}
                        {deadlineStr && ` · Apply by ${deadlineStr}`}
                      </div>
                    </div>

                    <div>
                      <Link
                        to={`/candidate/jobs/${job._id}`}
                        className="btn btn-primary"
                        style={{ height: "40px", padding: "0 20px" }}
                      >
                        View job
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination page={page} pages={totalPages} onPageChange={handlePageChange} />
        </>
      )}
    </div>
  );
}
