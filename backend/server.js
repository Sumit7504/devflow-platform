require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const companyRouter = require("./routes/companies");
const jobRouter         = require("./routes/jobs");
const applicationRouter = require("./routes/applications");
const assessmentRouter  = require("./routes/assessments");
const attemptRouter     = require("./routes/attempts");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

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

// ── Error Handling (must come last) ───────────────────────────────────────────
app.use(notFound);       // 404 — no route matched
app.use(errorHandler);   // 500 — something threw an error

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
