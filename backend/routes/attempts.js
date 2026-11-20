const express = require("express");
const router  = express.Router();

const {
  startAttempt,
  submitAttempt,
  myAttempts,
  assessmentAttempts,
  getAttemptById,
  gradeAttempt,
} = require("../controllers/attemptController");

const auth           = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const {
  startAttemptRules,
  submitAttemptRules,
  gradeAttemptRules,
  validate,
} = require("../middleware/validators");

// ── Candidate routes ──────────────────────────────────────────────────────────
router.post("/start", auth, authorizeRoles("candidate"), startAttemptRules, validate, startAttempt);

// /my declared BEFORE /:id so "my" is never parsed as an ObjectId
router.get("/my", auth, authorizeRoles("candidate"), myAttempts);

// ── Recruiter routes ──────────────────────────────────────────────────────────
// /assessment/:assessmentId declared BEFORE /:id
router.get("/assessment/:assessmentId", auth, authorizeRoles("recruiter"), assessmentAttempts);

router.patch("/:id/grade", auth, authorizeRoles("recruiter"), gradeAttemptRules, validate, gradeAttempt);

// ── Candidate submit route ────────────────────────────────────────────────────
router.post("/:id/submit", auth, authorizeRoles("candidate"), submitAttemptRules, validate, submitAttempt);

// ── Shared GET /:id (candidate or recruiter) ──────────────────────────────────
router.get("/:id", auth, getAttemptById);

module.exports = router;
