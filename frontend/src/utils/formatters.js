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

/**
 * Returns the user's resolved local time zone identifier (e.g. "Asia/Kolkata", "America/New_York").
 */
export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Format an interview slot start and end in user's local timezone.
 * Shows both dates when crossing midnight.
 * Example (same day): "15 Dec 2026, 10:00 AM – 10:45 AM (IST)"
 * Example (midnight cross): "15 Dec 2026, 11:30 PM – 16 Dec 2026, 12:30 AM (IST)"
 */
export function formatSlotRange(startStr, endStr) {
  if (!startStr || !endStr) return "";
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";

  const timeZone = getUserTimeZone();

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });

  const tzFormatter = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "short",
    timeZone,
  });

  const tzParts = tzFormatter.formatToParts(start);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value || timeZone;

  const startDateStr = dateFormatter.format(start);
  const endDateStr = dateFormatter.format(end);
  const startTimeStr = timeFormatter.format(start);
  const endTimeStr = timeFormatter.format(end);

  if (startDateStr === endDateStr) {
    return `${startDateStr}, ${startTimeStr} – ${endTimeStr} (${tzName})`;
  }
  return `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr} (${tzName})`;
}

/**
 * Check if a slot start timestamp is in the past.
 */
export function isSlotInPast(startStr) {
  if (!startStr) return false;
  const start = new Date(startStr);
  if (isNaN(start.getTime())) return false;
  return start.getTime() <= Date.now();
}
