import React, { useState, useEffect } from "react";
import client from "../api/client";
import { isValidHttpUrl, getErrorMessage } from "../utils/formatters";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";

const COMPANY_SIZES = ["", "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export default function CompanyProfile() {
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [logo, setLogo] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchCompany = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSuccessMessage("");

    client
      .get("/companies/me", { signal: controller.signal })
      .then((res) => {
        if (res.data?.success && res.data.company) {
          const c = res.data.company;
          setName(c.name || "");
          setDescription(c.description || "");
          setWebsite(c.website || "");
          setLocation(c.location || "");
          setIndustry(c.industry || "");
          setSize(c.size || "");
          setLogo(c.logo || "");
          setIsCreateMode(false);
        }
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          // 404 from /companies/me strictly indicates no company profile yet
          setIsCreateMode(true);
        } else {
          const msg = getErrorMessage(err, "Failed to load company profile.");
          if (msg) setError(msg);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = fetchCompany();
    return cleanup;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setError(null);
    setSuccessMessage("");

    const clientErrors = {};

    // Validate website if present
    if (website.trim() && !isValidHttpUrl(website.trim())) {
      clientErrors.website = "Website must be a valid URL (include http:// or https://)";
    }

    // Validate logo URL if present
    if (logo.trim() && !isValidHttpUrl(logo.trim())) {
      clientErrors.logo = "Logo must be a valid URL (include http:// or https://)";
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      website: website.trim(),
      location: location.trim(),
      industry: industry.trim(),
      size: size || "",
      logo: logo.trim(),
    };

    try {
      if (isCreateMode) {
        const res = await client.post("/companies", payload);
        if (res.data?.success) {
          setIsCreateMode(false);
          setSuccessMessage("Company profile created successfully.");
        }
      } else {
        const res = await client.put("/companies/me", payload);
        if (res.data?.success) {
          setSuccessMessage("Company profile updated successfully.");
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
          setError(data.message || "Failed to save company profile.");
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
      <div className="page-header">
        <h1 className="page-title">
          {isCreateMode ? "Create company profile" : "Company profile"}
        </h1>
        <p className="page-subtitle">
          {isCreateMode
            ? "Set up your organization's verified profile to post job opportunities."
            : "Update and manage your organization details visible to candidates."}
        </p>
      </div>

      {loading && <Loader message="Loading company profile..." />}

      {error && !isCreateMode && <ErrorMessage message={error} onRetry={fetchCompany} />}

      {!loading && (
        <div className="card" style={{ maxWidth: "680px" }}>
          {successMessage && <div className="alert alert-success">{successMessage}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="companyName">
                Company name *
              </label>
              <input
                id="companyName"
                type="text"
                className={`form-control ${fieldErrors.name ? "is-invalid" : ""}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Northwind Labs"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">
                Company description
              </label>
              <textarea
                id="description"
                className={`form-control ${fieldErrors.description ? "is-invalid" : ""}`}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe what your organization does..."
                disabled={isSubmitting}
                style={{ height: "auto", padding: "10px 14px", resize: "vertical" }}
              />
              {fieldErrors.description && (
                <span className="field-error">{fieldErrors.description}</span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
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
                  placeholder="e.g. San Francisco, CA / Remote"
                  disabled={isSubmitting}
                />
                {fieldErrors.location && (
                  <span className="field-error">{fieldErrors.location}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="industry">
                  Industry
                </label>
                <input
                  id="industry"
                  type="text"
                  className={`form-control ${fieldErrors.industry ? "is-invalid" : ""}`}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Software & Technology"
                  disabled={isSubmitting}
                />
                {fieldErrors.industry && (
                  <span className="field-error">{fieldErrors.industry}</span>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label" htmlFor="companySize">
                  Company size
                </label>
                <select
                  id="companySize"
                  className={`form-control ${fieldErrors.size ? "is-invalid" : ""}`}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Select company size</option>
                  {COMPANY_SIZES.filter(Boolean).map((s) => (
                    <option key={s} value={s}>
                      {s} employees
                    </option>
                  ))}
                </select>
                {fieldErrors.size && <span className="field-error">{fieldErrors.size}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="website">
                  Website URL
                </label>
                <input
                  id="website"
                  type="url"
                  className={`form-control ${fieldErrors.website ? "is-invalid" : ""}`}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  disabled={isSubmitting}
                />
                {fieldErrors.website && (
                  <span className="field-error">{fieldErrors.website}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="logo">
                Logo image URL
              </label>
              <input
                id="logo"
                type="url"
                className={`form-control ${fieldErrors.logo ? "is-invalid" : ""}`}
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={isSubmitting}
              />
              {fieldErrors.logo && <span className="field-error">{fieldErrors.logo}</span>}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ marginTop: "0.5rem" }}
            >
              {isSubmitting
                ? "Saving..."
                : isCreateMode
                ? "Create company profile"
                : "Save company profile"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
