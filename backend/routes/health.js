const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

/**
 * GET /api/health — Cheap liveness & readiness check.
 * Inspects cached mongoose.connection.readyState (0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting)
 * without executing an active database round-trip or query.
 *
 * If the database is disconnected or down:
 * - Returns HTTP 503 Service Unavailable so cloud load balancers, orchestrators, and uptime monitors
 *   detect degraded service immediately and refrain from routing traffic to this instance.
 * - Reports "disconnected" status without leaking connection strings, credentials, or internal error text.
 */
router.get("/", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const statusCode = isDbConnected ? 200 : 503;

  res.status(statusCode).json({
    success: isDbConnected,
    status: isDbConnected ? "healthy" : "degraded",
    database: isDbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
