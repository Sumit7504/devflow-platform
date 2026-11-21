import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import { formatSlotRange, getErrorMessage } from "../utils/formatters";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Proposed", value: "proposed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Declined", value: "declined" },
  { label: "Cancelled", value: "cancelled" },
];

export default function RecruiterInterviewList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Validate status and page from URL query string
  const validStatusValues = ["proposed", "confirmed", "declined", "cancelled"];
  const rawStatus = searchParams.get("status") || "";
  const status = validStatusValues.includes(rawStatus) ? rawStatus : "";

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [interviews, setInterviews] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInterviews = (signal) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "10");
    if (status) params.set("status", status);

    client
      .get(`/interviews/recruiter?${params.toString()}`, { signal })
      .then((res) => {
        if (res.data?.success) {
          setInterviews(res.data.interviews || []);
          setTotalPages(res.data.pages || 1);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load interviews.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchInterviews(controller.signal);
    return () => controller.abort();
  }, [page, status]);

  const handleTabChange = (newStatus) => {
    const next = new URLSearchParams(searchParams);
    if (newStatus) {
      next.set("status", newStatus);
    } else {
      next.delete("status");
    }
    // Reset to page 1 on tab change
    next.delete("page");
    setSearchParams(next);
  };

  const handlePageChange = (newPage) => {
    const next = new URLSearchParams(searchParams);
    if (newPage > 1) {
      next.set("page", newPage.toString());
    } else {
      next.delete("page");
    }
    setSearchParams(next);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Interviews</h1>
        <p className="page-subtitle">
          Track and manage technical and behavioral interview sessions across your candidates.
        </p>
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

      {loading && <Loader message="Loading interviews..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchInterviews(controller.signal);
          }}
        />
      )}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {interviews.length === 0 ? (
            <div style={{ padding: "2rem" }}>
              <EmptyState
                title="No interviews found"
                description={
                  status
                    ? `No interviews are currently marked as "${status}".`
                    : "No interviews have been proposed or scheduled yet."
                }
              />
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "25%" }}>Candidate</th>
                      <th style={{ width: "20%" }}>Job</th>
                      <th style={{ width: "12%" }}>Mode</th>
                      <th style={{ width: "13%" }}>Status</th>
                      <th style={{ width: "20%" }}>Scheduled Time</th>
                      <th style={{ width: "10%", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((item) => {
                      let scheduledDisplay = "—";
                      if (item.status === "confirmed" && item.selectedSlot) {
                        scheduledDisplay = formatSlotRange(
                          item.selectedSlot.start,
                          item.selectedSlot.end
                        );
                      } else if (item.status === "proposed") {
                        scheduledDisplay = "Waiting for candidate";
                      }

                      return (
                        <tr key={item._id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
                              {item.candidate?.name || "Candidate"}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8125rem",
                                color: "var(--color-text-gray)",
                                marginTop: "2px",
                              }}
                            >
                              {item.candidate?.email}
                            </div>
                          </td>

                          <td style={{ color: "var(--color-text)", fontWeight: 500 }}>
                            {item.job?.title || "Job"}
                          </td>

                          <td style={{ textTransform: "capitalize", color: "var(--color-text-gray)" }}>
                            {item.mode}
                          </td>

                          <td>
                            <StatusBadge status={item.status} />
                          </td>

                          <td
                            style={{
                              fontSize: "0.875rem",
                              color:
                                item.status === "confirmed"
                                  ? "var(--color-text)"
                                  : "var(--color-text-gray)",
                            }}
                          >
                            {scheduledDisplay}
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <Link
                              to={`/recruiter/interviews/${item._id}`}
                              className="btn btn-outline btn-sm"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "1rem" }}>
                <Pagination
                  page={page}
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