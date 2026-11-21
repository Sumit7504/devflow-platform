import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import EmptyState from "../components/common/EmptyState";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import UserActions from "../components/admin/UserActions";
import { getErrorMessage, formatDate } from "../utils/formatters";

export default function AdminUserList() {
  const { user: currentAdmin } = useAuth();
  const currentAdminId = (currentAdmin?._id || currentAdmin?.id)?.toString();

  const [searchParams, setSearchParams] = useSearchParams();

  // Validate URL params
  const rawRole = searchParams.get("role") || "";
  const role = ["candidate", "recruiter", "admin"].includes(rawRole) ? rawRole : "";

  const rawActive = searchParams.get("isActive") || "";
  const isActive = ["true", "false"].includes(rawActive) ? rawActive : "";

  const rawSearch = searchParams.get("search") || "";
  const initialSearch = rawSearch.slice(0, 100);

  const rawPage = parseInt(searchParams.get("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  // Local search text state for debounce (~400 ms)
  const [typedSearch, setTypedSearch] = useState(initialSearch);

  // Users data from backend: { success, count, total, totalPages, currentPage, users }
  const [users, setUsers] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Success alert message
  const [successMessage, setSuccessMessage] = useState("");

  // Processing row ID (disables actions on that row while in flight)
  const [processingId, setProcessingId] = useState(null);

  // Debounce typed search
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
        // Reset to page 1 on search change
        next.delete("page");
        return next;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [typedSearch, setSearchParams]);

  // Sync typedSearch if URL search param changes externally (e.g. back button)
  useEffect(() => {
    setTypedSearch(initialSearch);
  }, [rawSearch]);

  const fetchUsers = (signal) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "10");
    if (role) params.set("role", role);
    if (isActive) params.set("isActive", isActive);
    if (initialSearch.trim()) params.set("search", initialSearch.trim());

    client
      .get(`/admin/users?${params.toString()}`, { signal })
      .then((res) => {
        if (res.data?.success) {
          setUsers(res.data.users || []);
          setTotalPages(res.data.totalPages || 1);
          setCurrentPage(res.data.currentPage || 1);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load users list.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    return () => controller.abort();
  }, [page, role, isActive, initialSearch]);

  const handleRoleFilterChange = (newRole) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newRole) {
        next.set("role", newRole);
      } else {
        next.delete("role");
      }
      next.delete("page");
      return next;
    });
  };

  const handleActiveFilterChange = (newActive) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newActive) {
        next.set("isActive", newActive);
      } else {
        next.delete("isActive");
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

  const handleActionSuccess = (msg) => {
    setSuccessMessage(msg);
    // Refetch to receive authoritative server state
    fetchUsers();
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">View, activate, deactivate, and adjust roles for platform users.</p>
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
        {/* Search Box */}
        <div style={{ flex: "1 1 240px" }}>
          <label htmlFor="user-search-input" className="sr-only" style={{ display: "none" }}>
            Search users
          </label>
          <input
            id="user-search-input"
            type="text"
            className="form-control"
            placeholder="Search by name or email..."
            maxLength={100}
            value={typedSearch}
            onChange={(e) => setTypedSearch(e.target.value.slice(0, 100))}
          />
        </div>

        {/* Role Filter */}
        <div style={{ minWidth: "150px" }}>
          <label htmlFor="user-role-select" className="sr-only" style={{ display: "none" }}>
            Filter by role
          </label>
          <select
            id="user-role-select"
            className="form-control"
            value={role}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="candidate">Candidate</option>
            <option value="recruiter">Recruiter</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {/* Active Filter */}
        <div style={{ minWidth: "160px" }}>
          <label htmlFor="user-active-select" className="sr-only" style={{ display: "none" }}>
            Filter by status
          </label>
          <select
            id="user-active-select"
            className="form-control"
            value={isActive}
            onChange={(e) => handleActiveFilterChange(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </select>
        </div>
      </div>

      {loading && <Loader message="Loading users..." />}

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchUsers(controller.signal);
          }}
        />
      )}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {users.length === 0 ? (
            <div style={{ padding: "2rem" }}>
              <EmptyState
                title="No users found"
                description={
                  initialSearch || role || isActive
                    ? "No platform users match the specified search or filter criteria."
                    : "No users exist in the database."
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
                      <th style={{ width: "25%" }}>Name</th>
                      <th style={{ width: "30%" }}>Email</th>
                      <th style={{ width: "12%" }}>Role</th>
                      <th style={{ width: "13%" }}>Status</th>
                      <th style={{ width: "20%", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((targetUser) => {
                      const userIsActive = targetUser.isActive !== false;
                      const targetUserId = targetUser._id || targetUser.id;

                      return (
                        <tr key={targetUserId}>
                          <td>
                            <Link
                              to={`/admin/users/${targetUserId}`}
                              style={{
                                fontWeight: 600,
                                color: "var(--color-text)",
                                textDecoration: "none",
                              }}
                            >
                              {targetUser.name}
                            </Link>
                          </td>

                          {/* Wrap long emails (Requirement 10) */}
                          <td
                            style={{
                              color: "var(--color-text-gray)",
                              wordBreak: "break-all",
                            }}
                          >
                            {targetUser.email}
                          </td>

                          <td style={{ textTransform: "capitalize", fontWeight: 500 }}>
                            {targetUser.role}
                          </td>

                          <td>
                            <StatusBadge
                              status={userIsActive ? "active" : "deactivated"}
                            />
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                justifyContent: "flex-end",
                              }}
                            >
                              <UserActions
                                user={targetUser}
                                currentAdminId={currentAdminId}
                                onActionSuccess={handleActionSuccess}
                                isProcessing={processingId === targetUserId.toString()}
                                setProcessingId={setProcessingId}
                              />
                              <Link
                                to={`/admin/users/${targetUserId}`}
                                className="btn btn-outline btn-sm"
                              >
                                View
                              </Link>
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