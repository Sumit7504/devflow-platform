/**
 * Formatting and URL validation helpers
 */

/**
 * Format a date string with user's locale (e.g. "15 Dec 2026")
 */
export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Format deadlines with UTC timeZone (e.g. "15 Dec 2026")
 */
export function formatDeadline(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Format salary as plain numbers with Intl.NumberFormat (no currency symbol).
 * Returns empty string if both min and max are null/undefined.
 */
export function formatSalary(min, max) {
  const hasMin = min !== null && min !== undefined && !isNaN(min);
  const hasMax = max !== null && max !== undefined && !isNaN(max);

  if (!hasMin && !hasMax) return "";

  const formatter = new Intl.NumberFormat(undefined);

  if (hasMin && hasMax) {
    if (min === max) return formatter.format(min);
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }
  if (hasMin) return `From ${formatter.format(min)}`;
  return `Up to ${formatter.format(max)}`;
}

/**
 * Validates whether a URL string is an absolute http or https URL using new URL().
 */
export function isValidHttpUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Safely extracts user-friendly error message, differentiating network vs API errors.
 */
export function getErrorMessage(err, fallback = "An unexpected error occurred.") {
  if (!err) return fallback;
  // Ignore aborted / canceled requests
  if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return null;
  if (!err.response) {
    return "Unable to reach server. Please check your network connection.";
  }
  return err.response.data?.message || fallback;
}
