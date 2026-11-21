import React from "react";
import { Link } from "react-router-dom";

export default function EmptyState({
  title = "No results found",
  description,
  actionLink,
  actionText,
}) {
  return (
    <div className="empty-state card">
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionLink && actionText && (
        <div style={{ marginTop: "1rem" }}>
          <Link to={actionLink} className="btn btn-primary btn-sm">
            {actionText}
          </Link>
        </div>
      )}
    </div>
  );
}
