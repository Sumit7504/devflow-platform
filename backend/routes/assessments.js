const express = require("express");
const router  = express.Router();

const {
  createAssessment,
  getByJobId,
  getById,
  updateAssessment,
  deleteAssessment,
} = require("../controllers/assessmentController");

const auth           = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const { assessmentRules, updateAssessmentRules, validate } = require("../middleware/validators");

// Recruiter-only write routes
router.post("/",    auth, authorizeRoles("recruiter"), assessmentRules, validate, createAssessment);

// /job/:jobId declared BEFORE /:id — "job" must never be matched as an assessment ObjectId
router.get("/job/:jobId", auth, getByJobId);

// Any logged-in user (access control enforced in controller)
router.get("/:id",        auth, getById);

// Recruiter-only update/delete
router.put("/:id",    auth, authorizeRoles("recruiter"), updateAssessmentRules, validate, updateAssessment);
router.delete("/:id", auth, authorizeRoles("recruiter"), deleteAssessment);

module.exports = router;
