require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { init: initSocket } = require("./socket");
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

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO on the HTTP server
initSocket(server);

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json()); // Parse incoming JSON request bodies

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/companies", companyRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/assessments",  assessmentRouter);
app.use("/api/attempts",     attemptRouter);
app.use("/api/interviews",   interviewRouter);
app.use("/api/admin",        adminRouter);
app.use("/api/notifications", notificationRouter);

// ── Error Handling (must come last) ───────────────────────────────────────────
app.use(notFound);       // 404 — no route matched
app.use(errorHandler);   // 500 — something threw an error

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
