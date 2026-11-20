const express = require("express");
const router  = express.Router();

const {
  createInterview,
  getRecruiterInterviews,
  getCandidateInterviews,
  getInterviewById,
  confirmInterview,
  declineInterview,
  cancelInterview,
} = require("../controllers/interviewController");

const auth           = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const {
  createInterviewRules,
  confirmInterviewRules,
  validate,
} = require("../middleware/validators");

// ── Recruiter create ──────────────────────────────────────────────────────────
router.post("/", auth, authorizeRoles("recruiter"), createInterviewRules, validate, createInterview);

// ── List routes declared BEFORE /:id ──────────────────────────────────────────
router.get("/recruiter", auth, authorizeRoles("recruiter"), getRecruiterInterviews);
router.get("/my",        auth, authorizeRoles("candidate"), getCandidateInterviews);

// ── Status transition routes ──────────────────────────────────────────────────
router.patch("/:id/confirm", auth, authorizeRoles("candidate"), confirmInterviewRules, validate, confirmInterview);
router.patch("/:id/decline", auth, authorizeRoles("candidate"), declineInterview);
router.patch("/:id/cancel",  auth, authorizeRoles("recruiter"), cancelInterview);

// ── Shared GET /:id ───────────────────────────────────────────────────────────
router.get("/:id", auth, getInterviewById);

module.exports = router;
