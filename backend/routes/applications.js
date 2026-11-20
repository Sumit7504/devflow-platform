const express = require("express");
const router  = express.Router();

const {
  apply,
  myApplications,
  jobApplicants,
  changeStatus,
  getApplicationById,
} = require("../controllers/applicationController");

const auth           = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const { applyRules, statusChangeRules, validate } = require("../middleware/validators");

// ── Candidate routes ──────────────────────────────────────────────────────────
router.post("/",    auth, authorizeRoles("candidate"), applyRules, validate, apply);

// /my declared BEFORE /:id — "my" must never be treated as an ObjectId param
router.get("/my",   auth, authorizeRoles("candidate"), myApplications);

// ── Recruiter routes ──────────────────────────────────────────────────────────
// /job/:jobId declared BEFORE /:id for the same reason
router.get("/job/:jobId", auth, authorizeRoles("recruiter"), jobApplicants);
router.patch("/:id/status", auth, authorizeRoles("recruiter"), statusChangeRules, validate, changeStatus);

// ── Shared — candidate (own) OR recruiter (job owner) ─────────────────────────
router.get("/:id", auth, getApplicationById);

module.exports = router;
