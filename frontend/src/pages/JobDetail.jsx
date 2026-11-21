import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import {
  formatSalary,
  formatDeadline,
  isValidHttpUrl,
  getErrorMessage,
} from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";

export default function JobDetail() {
  const { id } = useParams();

  const [job, setJob] = useState(null);
  const [existingApplicationId, setExistingApplicationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Apply form state
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submittedApplicationId, setSubmittedApplicationId] = useState(null);

  const fetchJobAndApplications = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      client.get(`/jobs/${id}`, { signal: controller.signal }),
      client.get("/applications/my", { signal: controller.signal }),
    ])
      .then(([jobRes, appsRes]) => {
        if (jobRes.data?.success) {
          setJob(jobRes.data.job);
        }

        if (appsRes.data?.success && Array.isArray(appsRes.data.applications)) {
          const matched = appsRes.data.applications.find(
            (app) => (app.job?._id || app.job) === id
          );
          if (matched) {
            setExistingApplicationId(matched._id);
          }
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load job details.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchJobAndApplications();
    return cleanup;
  }, [id]);

  const handleApply = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError("");
    setIsSubmitting(true);

    try {
      const payload = {
        jobId: id,
        coverLetter: coverLetter.trim(),
        resumeUrl: resumeUrl.trim(),
      };

      const res = await client.post("/applications", payload);
      if (res.data?.success && res.data.application) {
        setSubmittedApplicationId(res.data.application._id);
      }
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;

        if (status === 422 && Array.isArray(data.errors)) {
          const mapped = {};
          data.errors.forEach((e) => {
            mapped[e.field] = e.message;
          });
          setFieldErrors(mapped);
        } else if (status === 409) {
          // Already applied
          setFormError("You have already applied for this job.");
          // Refresh applications to get the ID if not already known
          client.get("/applications/my").then((r) => {
            const matched = r.data?.applications?.find(
              (app) => (app.job?._id || app.job) === id
            );
            if (matched) setExistingApplicationId(matched._id);
          });
        } else {
          setFormError(data.message || "Failed to submit application.");
        }
      } else {
        setFormError("Unable to reach server. Please check your network connection.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <Loader message="Loading job details..." />;
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/candidate/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)" }}>
            ← Back to jobs
          </Link>
        </div>
        <ErrorMessage message={error} onRetry={fetchJobAndApplications} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>Job not found.</p>
        <Link to="/candidate/jobs" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to jobs
        </Link>
      </div>
    );
  }

  const isClosed = job.status === "closed";
  const isDeadlinePassed = job.deadline && new Date(job.deadline) < new Date();
  const salaryStr = formatSalary(job.salaryMin, job.salaryMax);
  const deadlineStr = job.deadline ? formatDeadline(job.deadline) : "";
  const validLogo = isValidHttpUrl(job.company?.logo);

  const targetApplicationId = submittedApplicationId || existingApplicationId;

  return (
    <div>
      {/* Back Link */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/candidate/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
          ← Back to jobs
        </Link>
      </div>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title">{job.title}</h1>
        <div style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", marginTop: "4px" }}>
          {job.company?.name || "Company"} · {job.location || "Remote"} ·{" "}
          <span style={{ textTransform: "capitalize" }}>{job.jobType}</span>
          {salaryStr && ` · ${salaryStr}`}
          {deadlineStr && ` · Apply by ${deadlineStr}`}
        </div>
      </div>

      {/* 2-Column Layout matching docs/desgin/Candidate Job detail and apply.png */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Job Content */}
        <div className="card" style={{ margin: 0 }}>
          {/* About the role */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--color-text)" }}>
              About the role
            </h2>
            <p style={{ color: "var(--color-text)", fontSize: "0.9375rem", lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {job.description}
            </p>
          </section>

          {/* Requirements */}
          {Array.isArray(job.requirements) && job.requirements.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--color-text)" }}>
                Requirements
              </h2>
              <ul style={{ paddingLeft: "1.25rem", color: "var(--color-text)", fontSize: "0.9375rem", lineHeight: 1.6 }}>
                {job.requirements.map((req, idx) => (
                  <li key={idx} style={{ marginBottom: "0.35rem" }}>
                    {req}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Skills */}
          {Array.isArray(job.skills) && job.skills.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--color-text)" }}>
                Skills
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {job.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="badge-tag"
                    style={{ fontSize: "0.8125rem", padding: "4px 12px" }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Company info footer if present */}
          {job.company && (
            <section style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "1rem" }}>
              {validLogo && (
                <img
                  src={job.company.logo}
                  alt={job.company.name}
                  style={{ width: "44px", height: "44px", borderRadius: "8px", objectFit: "contain", border: "1px solid var(--color-border)" }}
                />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{job.company.name}</div>
                {job.company.location && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>{job.company.location}</div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Apply Card */}
        <div className="card" style={{ margin: 0 }}>
          {targetApplicationId ? (
            /* Already applied / Just applied */
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                Application status
              </h2>
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  marginBottom: "1rem",
                }}
              >
                <p style={{ fontSize: "0.875rem", color: "var(--color-text)", marginBottom: "0.5rem", fontWeight: 500 }}>
                  {submittedApplicationId
                    ? "Your application has been submitted successfully."
                    : "You have already applied for this job."}
                </p>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)" }}>
                  You can track your application status and updates on your dashboard.
                </p>
              </div>

              <Link
                to={`/candidate/applications/${targetApplicationId}`}
                className="btn btn-primary"
                style={{ width: "100%", textAlign: "center" }}
              >
                View your application
              </Link>
            </div>
          ) : isClosed ? (
            /* Closed Job */
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                Position closed
              </h2>
              <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                This job posting is closed and no longer accepting new applications.
              </p>
              <Link to="/candidate/jobs" className="btn btn-outline" style={{ width: "100%", textAlign: "center" }}>
                Browse other jobs
              </Link>
            </div>
          ) : isDeadlinePassed ? (
            /* Passed Deadline */
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                Deadline passed
              </h2>
              <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                The application deadline for this position has passed.
              </p>
              <Link to="/candidate/jobs" className="btn btn-outline" style={{ width: "100%", textAlign: "center" }}>
                Browse other jobs
              </Link>
            </div>
          ) : (
            /* Open Apply Form */
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
                Apply for this job
              </h2>

              {formError && <div className="alert alert-danger">{formError}</div>}

              <form onSubmit={handleApply} noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor="coverLetter">
                    Cover letter (optional)
                  </label>
                  <textarea
                    id="coverLetter"
                    className={`form-control ${fieldErrors.coverLetter ? "is-invalid" : ""}`}
                    rows={4}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell the team why you're a great fit for this position..."
                    disabled={isSubmitting}
                    style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
                  />
                  {fieldErrors.coverLetter && (
                    <span className="field-error">{fieldErrors.coverLetter}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="resumeUrl">
                    Resume link (optional)
                  </label>
                  <input
                    id="resumeUrl"
                    type="url"
                    className={`form-control ${fieldErrors.resumeUrl ? "is-invalid" : ""}`}
                    value={resumeUrl}
                    onChange={(e) => setResumeUrl(e.target.value)}
                    placeholder="https://"
                    disabled={isSubmitting}
                  />
                  {fieldErrors.resumeUrl && (
                    <span className="field-error">{fieldErrors.resumeUrl}</span>
                  )}
                </div>

                {fieldErrors.jobId && (
                  <div className="field-error" style={{ marginBottom: "0.75rem" }}>
                    {fieldErrors.jobId}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "0.5rem" }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting application..." : "Submit application"}
                </button>

                <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-gray)", marginTop: "0.75rem" }}>
                  You can apply once per job.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
