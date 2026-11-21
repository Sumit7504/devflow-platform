import React, { useState, useRef, useEffect } from "react";
import client from "../../api/client";
import { getErrorMessage } from "../../utils/formatters";

export default function UserActions({
  user,
  currentAdminId,
  onActionSuccess,
  isProcessing,
  setProcessingId,
}) {
  const targetUserId = (user?._id || user?.id)?.toString();
  const isOwnAccount = Boolean(currentAdminId && targetUserId && currentAdminId === targetUserId);

  const isActive = user?.isActive !== false;
  const currentRole = user?.role || "candidate";

  // Role select state: keep in local state for selection, but revert on cancel/error
  const [selectedRole, setSelectedRole] = useState(currentRole);

  // Sync selectedRole if user prop changes (e.g. after refetch)
  useEffect(() => {
    setSelectedRole(currentRole);
  }, [currentRole]);

  // Inline confirmation state: null | "toggleStatus" | "changeRole"
  const [confirmAction, setConfirmAction] = useState(null);
  const openerRef = useRef(null);

  // Error message state
  const [actionError, setActionError] = useState("");

  // Guard against double submit
  const inFlightRef = useRef(false);

  const handleOpenStatusConfirm = (e) => {
    openerRef.current = e.currentTarget;
    setConfirmAction("toggleStatus");
    setActionError("");
  };

  const handleRoleSelectChange = (e) => {
    const newRole = e.target.value;
    if (newRole === currentRole) return;
    setSelectedRole(newRole);
    openerRef.current = e.currentTarget;
    setConfirmAction("changeRole");
    setActionError("");
  };

  const handleCancelConfirm = () => {
    // Revert role select back to the current server role (Requirement 6)
    setSelectedRole(currentRole);
    setConfirmAction(null);
    setActionError("");
    if (openerRef.current) {
      openerRef.current.focus();
    }
  };

  const handleConfirmStatusToggle = async () => {
    if (inFlightRef.current || isProcessing) return;
    inFlightRef.current = true;
    setProcessingId(targetUserId);
    setActionError("");

    const newActiveState = !isActive;

    try {
      const res = await client.patch(`/admin/users/${targetUserId}/status`, {
        isActive: newActiveState,
      });

      if (res.data?.success) {
        setConfirmAction(null);
        onActionSuccess(
          newActiveState
            ? `User "${user.name}" has been activated.`
            : `User "${user.name}" has been deactivated.`
        );
      }
    } catch (err) {
      // Show exact server error message (e.g. "Cannot deactivate the last remaining active admin")
      const msg = getErrorMessage(err, "Failed to update user status.");
      setActionError(msg);
    } finally {
      inFlightRef.current = false;
      setProcessingId(null);
    }
  };

  const handleConfirmRoleChange = async () => {
    if (inFlightRef.current || isProcessing) return;
    inFlightRef.current = true;
    setProcessingId(targetUserId);
    setActionError("");

    try {
      const res = await client.patch(`/admin/users/${targetUserId}/role`, {
        role: selectedRole,
      });

      if (res.data?.success) {
        setConfirmAction(null);
        onActionSuccess(`Role for "${user.name}" updated to ${selectedRole}.`);
      }
    } catch (err) {
      // Revert role select on error (Requirement 6)
      setSelectedRole(currentRole);
      // Show exact server error message (e.g. "Cannot change role of the last remaining admin")
      const msg = getErrorMessage(err, "Failed to update user role.");
      setActionError(msg);
    } finally {
      inFlightRef.current = false;
      setProcessingId(null);
    }
  };

  if (isOwnAccount) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center" }}>
        <span
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-text-gray)",
            fontStyle: "italic",
          }}
        >
          Your account (cannot modify)
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Action Controls */}
      {!confirmAction && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Status Toggle Button */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{
              color: isActive ? "var(--color-error)" : "var(--color-accent)",
              borderColor: "var(--color-border)",
            }}
            onClick={handleOpenStatusConfirm}
            disabled={isProcessing}
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </button>

          {/* Role Change Select */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <label htmlFor={`role_select_${targetUserId}`} className="sr-only" style={{ display: "none" }}>
              Change role for {user.name}
            </label>
            <select
              id={`role_select_${targetUserId}`}
              value={selectedRole}
              onChange={handleRoleSelectChange}
              disabled={isProcessing}
              className="form-control"
              style={{
                height: "32px",
                padding: "0 8px",
                fontSize: "0.8125rem",
                width: "auto",
                minWidth: "110px",
              }}
            >
              <option value="candidate">Candidate</option>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
      )}

      {/* Inline Confirmation for Status Toggle */}
      {confirmAction === "toggleStatus" && (
        <div className="inline-confirm" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <span className="confirm-text" aria-live="polite" style={{ fontSize: "0.8125rem" }}>
            Are you sure you want to <strong>{isActive ? "deactivate" : "reactivate"}</strong> {user.name}?
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{
              color: isActive ? "var(--color-error)" : "var(--color-accent)",
              borderColor: isActive ? "var(--color-error)" : "var(--color-accent)",
            }}
            onClick={handleConfirmStatusToggle}
            disabled={isProcessing}
          >
            {isProcessing ? "Updating..." : `Yes, ${isActive ? "deactivate" : "reactivate"}`}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleCancelConfirm}
            disabled={isProcessing}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline Confirmation for Role Change */}
      {confirmAction === "changeRole" && (
        <div className="inline-confirm" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
          <span className="confirm-text" aria-live="polite" style={{ fontSize: "0.8125rem" }}>
            Change role of {user.name} to <strong>{selectedRole}</strong>?
          </span>

          {selectedRole === "admin" && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--color-error)",
                fontWeight: 600,
                display: "block",
              }}
            >
              Warning: Promoting to admin grants full administrative control over the platform.
            </span>
          )}

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleConfirmRoleChange}
              disabled={isProcessing}
            >
              {isProcessing ? "Saving..." : `Confirm ${selectedRole}`}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleCancelConfirm}
              disabled={isProcessing}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Error Message */}
      {actionError && (
        <span
          className="field-error"
          aria-live="polite"
          style={{ fontSize: "0.8125rem", maxWidth: "260px" }}
        >
          {actionError}
        </span>
      )}
    </div>
  );
}