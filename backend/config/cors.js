/**
 * CORS Configuration Helper.
 * Builds an allow-list from comma-separated CLIENT_URL entries.
 * - Trims leading/trailing whitespace.
 * - Strips trailing slashes from entries.
 * - Allows requests with no Origin header (CLI, curl, server-to-server).
 * - Disallows wildcards.
 * - Sets no credentials.
 */

const getAllowedOrigins = () => {
  const raw =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
};

const corsOriginDelegate = (origin, callback) => {
  // Allow requests with no Origin header (e.g. mobile apps, curl, Postman, test scripts)
  if (!origin) {
    return callback(null, true);
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, "");
  const allowed = getAllowedOrigins();

  if (allowed.includes(normalizedOrigin)) {
    return callback(null, true);
  }

  return callback(null, false);
};

const expressCorsOptions = {
  origin: corsOriginDelegate,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

module.exports = {
  getAllowedOrigins,
  corsOriginDelegate,
  expressCorsOptions,
};
