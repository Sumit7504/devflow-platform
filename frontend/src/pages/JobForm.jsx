import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";

const JOB_TYPES = ["full-time", "part-time", "internship", "contract"];

export default function JobForm() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [noCompany, setNoCompany] = useState(false);
  const [isJobClosed, setIsJobClosed] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [location, setLocation] = useState("");
  const [jobType, setJobType] = useState("full-time");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [deadline, setDeadline] = useState(""); // YYYY-MM-DD
  const [deadlineWarning, setDeadlineWarning] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const loadData = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    setNoCompany(false);

    if (isEditMode) {
      // Edit mode: fetch job by ID
      client
        .get(`/jobs/${id}`, { signal: controller.signal })
        .then((res) => {
          if (res.data?.success && res.data.job) {
            const job = res.data.job;

            // Ownership check
            const postedById = (job.postedBy?._id || job.postedBy)?.toString();
            const currentUserId = (user?._id || user?.id)?.toString();
            if (postedById && currentUserId && postedById !== currentUserId) {
              setUnauthorized(true);
              return;
            }

            setTitle(job.title || "");
            setDescription(job.description || "");
            setRequirementsText(Array.isArray(job.requirements) ? job.requirements.join("\n") : "");
            setSkillsText(Array.isArray(job.skills) ? job.skills.join("\n") : "");
            setLocation(job.location || "");
            setJobType(job.jobType || "full-time");
            setSalaryMin(job.salaryMin !== null && job.salaryMin !== undefined ? String(job.salaryMin) : "");
            setSalaryMax(job.salaryMax !== null && job.salaryMax !== undefined ? String(job.salaryMax) : "");

            // Extract YYYY-MM-DD from ISO UTC string
            if (job.deadline) {
              setDeadline(job.deadline.substring(0, 10));
            } else {
              setDeadline("");
            }

            if (job.status === "closed") {
              setIsJobClosed(true);
            }
          }
        })
        .catch((err) => {
          if (err.response?.status === 403) {
            setUnauthorized(true);
          } else {
            const msg = getErrorMessage(err, "Failed to load job details.");
            if (msg) setError(msg);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Create mode: verify recruiter has a company first
      client
        .get("/companies/me", { signal: controller.signal })
        .then((res) => {
          if (!res.data?.success || !res.data.company) {
            setNoCompany(true);
          }
        })
        .catch((err) => {
          if (err.response?.status === 404) {
            // No company created yet
            setNoCompany(true);
          } else {
            const msg = getErrorMessage(err, "Failed to check company status.");
            if (msg) setError(msg);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = loadData();
    return cleanup;
  }, [id]);

  const handleDeadlineChange = (val) => {
    setDeadline(val);
    if (!isEditMode && val) {
      const selected = new Date(`${val}T00:00:00.000Z`);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (selected < today) {
        setDeadlineWarning("Warning: Selected deadline is in the past.");
      } else {
        setDeadlineWarning("");
      }
    } else {
      setDeadlineWarning("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setError(null);
    setSuccessMessage("");

    // Client-side validations
    const clientErrors = {};

    if (!title.trim()) {
      clientErrors.title = "Job title is required";
    }

    if (!description.trim()) {
      clientErrors.description = "Job description is required";
    }

    const minNum = salaryMin.trim() !== "" ? Number(salaryMin) : null;
    const maxNum = salaryMax.trim() !== "" ? Number(salaryMax) : null;

    if (minNum !== null && isNaN(minNum)) {
      clientErrors.salaryMin = "salaryMin must be a number";
    }
    if (maxNum !== null && isNaN(maxNum)) {
      clientErrors.salaryMax = "salaryMax must be a number";
    }
    if (minNum !== null && maxNum !== null && maxNum < minNum) {
      clientErrors.salaryMax = "salaryMax must be greater than or equal to salaryMin";
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    // Form cleanup: trim lines, drop empties and duplicates
    const requirements = Array.from(
      new Set(
        requirementsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    const skills = Array.from(
      new Set(
        skillsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    // Format deadline with timeZone UTC, or null to clear
    const deadlineIso = deadline.trim() ? `${deadline.trim()}T00:00:00.000Z` : null;

    // Build payload without protected fields (company, postedBy, status)
    const payload = {
      title: title.trim(),
      description: description.trim(),
      requirements,
      skills,
      location: location.trim(),
      jobType,
      salaryMin: minNum,
      salaryMax: maxNum,
      deadline: deadlineIso,
    };

    setIsSubmitting(true);

    try {
      if (isEditMode) {
        const res = await client.put(`/jobs/${id}`, payload);
        if (res.data?.success) {
          setSuccessMessage("Job updated successfully.");
        }
      } else {
        const res = await client.post("/jobs", payload);
        if (res.data?.success) {
          // Redirect to jobs list after creating
          navigate("/recruiter/jobs", { replace: true });
        }
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
        } else {
          setError(data.message || "Failed to save job.");
        }
      } else {
        setError("Unable to reach server. Please check your network connection.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/recruiter/jobs" style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}>
          ← Back to jobs
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">{isEditMode ? "Edit job posting" : "Post a new job"}</h1>
        <p className="page-subtitle">
          {isEditMode
            ? "Update role requirements, skills, and compensation details."
            : "Publish an open position to attract qualified candidates on DevFlow."}
        </p>
      </div>

      {loading && <Loader message="Loading..." />}

      {unauthorized && (
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
            Access denied
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            You are not authorized to edit this job posting.
          </p>
          <Link to="/recruiter/jobs" className="btn btn-outline btn-sm">
            Back to my jobs
          </Link>
        </div>
      )}

      {noCompany && (
        <div className="card" style={{ maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Company profile required
          </h2>
          <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            You must create a company profile before posting a job.
          </p>
          <Link to="/recruiter/company" className="btn btn-primary btn-sm">
            Create company profile
          </Link>
        </div>
      )}

      {error && !unauthorized && !noCompany && <ErrorMessage message={error} onRetry={loadData} />}

      {!loading && !unauthorized && !noCompany && (
        <div className="card" style={{ maxWidth: "760px" }}>
          {successMessage && <div className="alert alert-success">{successMessage}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          {isJobClosed && (
            <div className="alert alert-warning" style={{ marginBottom: "1.25rem" }}>
              Notice: This job is closed and no longer accepting applications. Saving edits will
              update the job details, but it will remain closed.
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="title">
                Job title *
              </label>
              <input
                id="title"
                type="text"
                className={`form-control ${fieldErrors.title ? "is-invalid" : ""}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer (Node.js)"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">
                Job description *
              </label>
              <textarea
                id="description"
                className={`form-control ${fieldErrors.description ? "is-invalid" : ""}`}
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of the responsibilities and scope..."
                disabled={isSubmitting}
                style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
                required
              />
              {fieldErrors.description && (
                <span className="field-error">{fieldErrors.description}</span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label" htmlFor="jobType">
                  Employment type *
                </label>
                <select
                  id="jobType"
                  className={`form-control ${fieldErrors.jobType ? "is-invalid" : ""}`}
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  disabled={isSubmitting}
                >
                  {JOB_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                {fieldErrors.jobType && (
                  <span className="field-error">{fieldErrors.jobType}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="location">
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  className={`form-control ${fieldErrors.location ? "is-invalid" : ""}`}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Pune / Remote"
                  disabled={isSubmitting}
                />
                {fieldErrors.location && (
                  <span className="field-error">{fieldErrors.location}</span>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label" htmlFor="salaryMin">
                  Minimum annual salary (optional)
                </label>
                <input
                  id="salaryMin"
                  type="number"
                  className={`form-control ${fieldErrors.salaryMin ? "is-invalid" : ""}`}
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 800000"
                  disabled={isSubmitting}
                />
                {fieldErrors.salaryMin && (
                  <span className="field-error">{fieldErrors.salaryMin}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="salaryMax">
                  Maximum annual salary (optional)
                </label>
                <input
                  id="salaryMax"
                  type="number"
                  className={`form-control ${fieldErrors.salaryMax ? "is-invalid" : ""}`}
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 1200000"
                  disabled={isSubmitting}
                />
                {fieldErrors.salaryMax && (
                  <span className="field-error">{fieldErrors.salaryMax}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="deadline">
                Application deadline (optional)
              </label>
              <input
                id="deadline"
                type="date"
                className={`form-control ${fieldErrors.deadline ? "is-invalid" : ""}`}
                value={deadline}
                onChange={(e) => handleDeadlineChange(e.target.value)}
                disabled={isSubmitting}
              />
              {deadlineWarning && (
                <span style={{ fontSize: "0.8125rem", color: "#854d0e", marginTop: "4px", display: "block" }}>
                  {deadlineWarning}
                </span>
              )}
              {fieldErrors.deadline && (
                <span className="field-error">{fieldErrors.deadline}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="requirements">
                Requirements (one per line)
              </label>
              <textarea
                id="requirements"
                className={`form-control ${fieldErrors.requirements ? "is-invalid" : ""}`}
                rows={4}
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                placeholder={"3+ years experience with Node.js and Express\nStrong knowledge of MongoDB schema design\nExperience writing unit and integration tests"}
                disabled={isSubmitting}
                style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
              />
              {fieldErrors.requirements && (
                <span className="field-error">{fieldErrors.requirements}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="skills">
                Skills (one per line)
              </label>
              <textarea
                id="skills"
                className={`form-control ${fieldErrors.skills ? "is-invalid" : ""}`}
                rows={3}
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder={"Node.js\nExpress\nMongoDB\nSocket.IO"}
                disabled={isSubmitting}
                style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
              />
              {fieldErrors.skills && <span className="field-error">{fieldErrors.skills}</span>}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Saving..."
                  : isEditMode
                  ? "Update job posting"
                  : "Publish job posting"}
              </button>

              <Link to="/recruiter/jobs" className="btn btn-outline" style={{ minWidth: "90px" }}>
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
