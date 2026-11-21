import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";
import ErrorMessage from "../components/common/ErrorMessage";
import StatusBadge from "../components/common/StatusBadge";
import UserActions from "../components/admin/UserActions";
import { getErrorMessage, formatDate } from "../utils/formatters";

export default function AdminUserDetail() {
  const { id } = useParams();
  const { user: currentAdmin } = useAuth();
  const currentAdminId = (currentAdmin?._id || currentAdmin?.id)?.toString();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [processingId, setProcessingId] = useState(null);

  const fetchUser = (signal) => {
    setLoading(true);
    setError(null);

    client
      .get(`/admin/users/${id}`, { signal })
      .then((res) => {
        if (res.data?.success && res.data.user) {
          setUser(res.data.user);
        }
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load user profile.");
        if (msg) setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchUser(controller.signal);
    return () => controller.abort();
  }, [id]);

  const handleActionSuccess = (msg) => {
    setSuccessMessage(msg);
    // Refetch full user data
    fetchUser();
  };

  if (loading) {
    return <Loader message="Loading user details..." />;
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to="/admin/users"
            style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
          >
            ← Back to users
          </Link>
        </div>
        <ErrorMessage
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            fetchUser(controller.signal);
          }}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-gray)" }}>User not found.</p>
        <Link to="/admin/users" className="btn btn-primary btn-sm" style={{ marginTop: "1rem" }}>
          Back to users
        </Link>
      </div>
    );
  }

  const userIsActive = user.isActive !== false;
  const targetUserId = user._id || user.id;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/admin/users"
          style={{ fontSize: "0.875rem", color: "var(--color-text-gray)", textDecoration: "none" }}
        >
          ← Back to users
        </Link>
      </div>

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">{user.name}</h1>
          <div style={{ fontSize: "0.9375rem", color: "var(--color-text-gray)", marginTop: "4px", wordBreak: "break-all" }}>
            {user.email}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <StatusBadge status={userIsActive ? "active" : "deactivated"} />
        </div>
      </div>

      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
          {successMessage}
        </div>
      )}

      {/* User Information Card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
          Account Details
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
              Role
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, textTransform: "capitalize" }}>
              {user.role}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
              Account Status
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
              {userIsActive ? "Active" : "Deactivated"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
              Registered On
            </div>
            <div style={{ fontSize: "0.9375rem" }}>
              {formatDate(user.createdAt)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-gray)", marginBottom: "2px" }}>
              Last Updated
            </div>
            <div style={{ fontSize: "0.9375rem" }}>
              {formatDate(user.updatedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Management Actions Card */}
      <div className="card">
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Administrative Actions
        </h2>
        <p style={{ color: "var(--color-text-gray)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Deactivate or reactivate this user's account, or adjust their role permissions.
        </p>

        {/* Shared UserActions Component (Requirement 5) */}
        <UserActions
          user={user}
          currentAdminId={currentAdminId}
          onActionSuccess={handleActionSuccess}
          isProcessing={processingId === targetUserId.toString()}
          setProcessingId={setProcessingId}
        />
      </div>
    </div>
  );
}