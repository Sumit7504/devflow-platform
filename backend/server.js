const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const validateEnv = require("./config/env");
const connectDB = require("./config/db");
const { expressCorsOptions } = require("./config/cors");
const { init: initSocket, close: closeSocket } = require("./socket");
const { generalLimiter } = require("./middleware/rateLimiters");

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const companyRouter = require("./routes/companies");
const jobRouter         = require("./routes/jobs");
const applicationRouter = require("./routes/applications");
const assessmentRouter  = require("./routes/assessments");
const attemptRouter     = require("./routes/attempts");
const interviewRouter   = require("./routes/interviews");
const adminRouter       = require("./routes/admin");
const notificationRouter= require("./routes/notifications");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

// ── Startup Environment Validation ───────────────────────────────────────────
validateEnv();

const app = express();
const server = http.createServer(app);

// ── Reverse Proxy Configuration ───────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  // Render runs behind a single reverse proxy layer.
  // Setting trust proxy to 1 enables Express and rate-limiting to inspect the true client IP from X-Forwarded-For.
  app.set("trust proxy", 1);
}

// ── Initialize Socket.IO ──────────────────────────────────────────────────────
initSocket(server);

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

// ── Security & Core Middleware ────────────────────────────────────────────────
// Helmet sets secure HTTP headers; CSP is disabled for JSON REST API
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS: allow-list built from CLIENT_URL, supports curl/Postman (no origin), no wildcards, no credentials
app.use(cors(expressCorsOptions));

// Body parser with 100kb limit (oversized or malformed JSON handled in errorHandler)
app.use(express.json({ limit: "100kb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
// Health check: mounted before rate limiting so liveness probes are never throttled
app.use("/api/health", healthRouter);

// Apply general rate limiter (~600 req/15min) across /api
app.use("/api", generalLimiter);

// Resource routers
app.use("/api/auth", authRouter);
app.use("/api/companies", companyRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/assessments",  assessmentRouter);
app.use("/api/attempts",     attemptRouter);
app.use("/api/interviews",   interviewRouter);
app.use("/api/admin",        adminRouter);
app.use("/api/notifications", notificationRouter);

// ── Error Handling ────────────────────────────────────────────────────────────
app.use(notFound);       // 404 — no route matched
app.use(errorHandler);   // Centralized error handler (sanitizes 5xx in production)

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});

// ── Graceful Shutdown & Process Handlers ──────────────────────────────────────
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}. Starting graceful shutdown...`);

  // 10-second force-exit timer prevents hanging processes
  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out after 10s. Forcing process exit.");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  // 1. Close Socket.IO connections first
  await new Promise((resolve) => closeSocket(resolve));
  console.log("Socket.IO connections closed.");

  // 2. Stop accepting incoming HTTP connections (if still listening)
  if (server.listening) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err && err.code !== "ERR_SERVER_NOT_RUNNING") {
          console.error("Error closing HTTP server:", err);
        } else {
          console.log("HTTP server closed.");
        }
        resolve();
      });
    });
  } else {
    console.log("HTTP server closed.");
  }

  // 3. Cleanly close MongoDB connection
  try {
    await mongoose.connection.close(false);
    console.log("MongoDB connection closed.");
    process.exit(0);
  } catch (dbErr) {
    console.error("Error closing MongoDB connection:", dbErr);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("message", (msg) => {
  if (msg === "SIGTERM" || msg === "SIGINT") {
    gracefulShutdown(msg);
  }
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

module.exports = { app, server, gracefulShutdown };
