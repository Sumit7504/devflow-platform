import React from "react";

export default function ErrorMessage({ message, onRetry }) {
  if (!message) return null;

  return (
    <div className="error-box">
      <p className="error-box-message">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-outline btn-sm">
          Retry
        </button>
      )}
    </div>
  );
}
