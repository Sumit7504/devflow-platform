import React from "react";

export default function Pagination({ page, pages, onPageChange }) {
  if (!pages || pages <= 1) return null;

  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>

      <span className="pagination-info">
        Page {page} of {pages}
      </span>

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
      >
        Next
      </button>
    </div>
  );
}
