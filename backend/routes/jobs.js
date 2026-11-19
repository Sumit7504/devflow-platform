const express = require("express");
const router  = express.Router();

const {
  createJob,
  listMyJobs,
  listJobs,
  getJobById,
  updateJob,
  closeJob,
} = require("../controllers/jobController");

const auth           = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const { jobRules, updateJobRules, validate } = require("../middleware/validators");

// ── Recruiter-only write routes ───────────────────────────────────────────────
router.post("/",              auth, authorizeRoles("recruiter"), jobRules,       validate, createJob);
router.patch("/:id/close",    auth, authorizeRoles("recruiter"), closeJob);

// ── /my declared BEFORE /:id so "my" is never treated as an ObjectId param ───
router.get("/my",             auth, authorizeRoles("recruiter"), listMyJobs);

// ── Any logged-in user ────────────────────────────────────────────────────────
router.get("/",               auth, listJobs);
router.get("/:id",            auth, getJobById);

// ── Recruiter-only update ─────────────────────────────────────────────────────
router.put("/:id",            auth, authorizeRoles("recruiter"), updateJobRules, validate, updateJob);

module.exports = router;
