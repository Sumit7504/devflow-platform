const { body, validationResult } = require("express-validator");

// ── Helper ────────────────────────────────────────────────────────────────────
// Call this inside any route handler to short-circuit on validation errors.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Register rules ────────────────────────────────────────────────────────────
const registerRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required"),

  body("email")
    .trim()
    .toLowerCase()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Must be a valid email address"),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),

  body("role")
    .optional()
    .isIn(["candidate", "recruiter"])
    .withMessage("Role must be candidate or recruiter"),
];

// ── Login rules ───────────────────────────────────────────────────────────────
const loginRules = [
  body("email")
    .trim()
    .toLowerCase()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Must be a valid email address"),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

// ── Company size options (kept in one place for model + validator to share) ───
const COMPANY_SIZES = ["", "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

// ── Create company rules ──────────────────────────────────────────────────────
const companyRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Company name is required"),

  body("description")
    .optional()
    .trim(),

  body("website")
    .optional()
    .trim()
    .isURL({ require_protocol: true }).withMessage("Website must be a valid URL (include http/https)"),

  body("location")
    .optional()
    .trim(),

  body("industry")
    .optional()
    .trim(),

  body("size")
    .optional()
    .isIn(COMPANY_SIZES).withMessage(`Size must be one of: ${COMPANY_SIZES.filter(Boolean).join(", ")}`),

  body("logo")
    .optional()
    .trim()
    .isURL({ require_protocol: true }).withMessage("Logo must be a valid URL (include http/https)"),
];

// ── Update company rules (all fields optional, same constraints) ──────────────
const updateCompanyRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Company name cannot be empty"),

  body("description")
    .optional()
    .trim(),

  body("website")
    .optional()
    .trim()
    .isURL({ require_protocol: true }).withMessage("Website must be a valid URL (include http/https)"),

  body("location")
    .optional()
    .trim(),

  body("industry")
    .optional()
    .trim(),

  body("size")
    .optional()
    .isIn(COMPANY_SIZES).withMessage(`Size must be one of: ${COMPANY_SIZES.filter(Boolean).join(", ")}`),

  body("logo")
    .optional()
    .trim()
    .isURL({ require_protocol: true }).withMessage("Logo must be a valid URL (include http/https)"),
];

// ── Job type options ──────────────────────────────────────────────────────────
const JOB_TYPES = ["full-time", "part-time", "internship", "contract"];

// ── Shared salary cross-field check ──────────────────────────────────────────
// Reused by both create and update rules.
const salaryMaxCheck = body("salaryMax").optional({ nullable: true }).custom((val, { req }) => {
  const min = req.body.salaryMin;
  if (val !== undefined && val !== null && min !== undefined && min !== null) {
    if (Number(val) < Number(min)) {
      throw new Error("salaryMax must be greater than or equal to salaryMin");
    }
  }
  return true;
});

// ── Create job rules ──────────────────────────────────────────────────────────
const jobRules = [
  body("title")
    .trim()
    .notEmpty().withMessage("Job title is required"),

  body("description")
    .trim()
    .notEmpty().withMessage("Job description is required"),

  body("jobType")
    .notEmpty().withMessage("Job type is required")
    .isIn(JOB_TYPES).withMessage(`jobType must be one of: ${JOB_TYPES.join(", ")}`),

  body("requirements")
    .optional()
    .isArray().withMessage("requirements must be an array of strings"),

  body("skills")
    .optional()
    .isArray().withMessage("skills must be an array of strings"),

  body("location")
    .optional()
    .trim(),

  body("salaryMin")
    .optional({ nullable: true })
    .isNumeric().withMessage("salaryMin must be a number"),

  salaryMaxCheck,

  body("deadline")
    .optional({ nullable: true })
    .isISO8601().withMessage("deadline must be a valid ISO 8601 date"),
];

// ── Update job rules (all fields optional, same constraints) ─────────────────
const updateJobRules = [
  body("title")
    .optional()
    .trim()
    .notEmpty().withMessage("Job title cannot be empty"),

  body("description")
    .optional()
    .trim()
    .notEmpty().withMessage("Job description cannot be empty"),

  body("jobType")
    .optional()
    .isIn(JOB_TYPES).withMessage(`jobType must be one of: ${JOB_TYPES.join(", ")}`),

  body("requirements")
    .optional()
    .isArray().withMessage("requirements must be an array of strings"),

  body("skills")
    .optional()
    .isArray().withMessage("skills must be an array of strings"),

  body("location")
    .optional()
    .trim(),

  body("salaryMin")
    .optional({ nullable: true })
    .isNumeric().withMessage("salaryMin must be a number"),

  salaryMaxCheck,

  body("deadline")
    .optional({ nullable: true })
    .isISO8601().withMessage("deadline must be a valid ISO 8601 date"),
];

// ── Application rules ─────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const applyRules = [
  body("jobId")
    .notEmpty().withMessage("jobId is required")
    .custom((val) => mongoose.Types.ObjectId.isValid(val))
    .withMessage("jobId must be a valid ID"),

  body("coverLetter")
    .optional()
    .trim(),

  body("resumeUrl")
    .optional()
    .trim()
    .isURL({ require_protocol: true })
    .withMessage("resumeUrl must be a valid URL (include http/https)"),
];

// ── Status change rules ───────────────────────────────────────────────────────
// "applied" is excluded — recruiters cannot revert an application to its initial state
const CHANGEABLE_STATUSES = ["shortlisted", "rejected", "hired"];

const statusChangeRules = [
  body("status")
    .notEmpty().withMessage("status is required")
    .isIn(CHANGEABLE_STATUSES)
    .withMessage(`status must be one of: ${CHANGEABLE_STATUSES.join(", ")}`),
];

// ── Assessment question cross-field validator ─────────────────────────────────
// Validates each question in the array for type-specific rules.
// Reused by both create and update rules.
const validateQuestions = (questions) => {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") {
      throw new Error(`questions[${i}]: must be an object`);
    }
    if (!["mcq", "code"].includes(q.type)) {
      throw new Error(`questions[${i}]: type must be "mcq" or "code"`);
    }
    if (!q.text || typeof q.text !== "string" || !q.text.trim()) {
      throw new Error(`questions[${i}]: text is required`);
    }
    if (!Number.isInteger(q.points) || q.points < 1) {
      throw new Error(`questions[${i}]: points must be an integer >= 1`);
    }

    if (q.type === "mcq") {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
        throw new Error(`questions[${i}]: mcq question must have 2 to 6 options`);
      }
      const maxIdx = q.options.length - 1;
      if (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption > maxIdx) {
        throw new Error(`questions[${i}]: correctOption must be a valid index (0 to ${maxIdx})`);
      }
    }

    if (q.type === "code") {
      const hasOptions = Array.isArray(q.options) && q.options.length > 0;
      if (hasOptions) {
        throw new Error(`questions[${i}]: code question must not have options`);
      }
      if (q.correctOption !== undefined && q.correctOption !== null) {
        throw new Error(`questions[${i}]: code question must not have correctOption`);
      }
    }
  }
  return true;
};

// ── Create assessment rules ───────────────────────────────────────────────────
const assessmentRules = [
  body("jobId")
    .notEmpty().withMessage("jobId is required")
    .custom((val) => mongoose.Types.ObjectId.isValid(val))
    .withMessage("jobId must be a valid ID"),

  body("title")
    .trim()
    .notEmpty().withMessage("Assessment title is required"),

  body("durationMinutes")
    .notEmpty().withMessage("durationMinutes is required")
    .isInt({ min: 1, max: 180 })
    .withMessage("durationMinutes must be an integer between 1 and 180"),

  body("questions")
    .isArray({ min: 1, max: 50 })
    .withMessage("questions must be an array of 1 to 50 items")
    .custom(validateQuestions),

  body("description").optional().trim(),
];

// ── Update assessment rules (all fields optional, same constraints) ────────────
const updateAssessmentRules = [
  body("title")
    .optional()
    .trim()
    .notEmpty().withMessage("Assessment title cannot be empty"),

  body("durationMinutes")
    .optional()
    .isInt({ min: 1, max: 180 })
    .withMessage("durationMinutes must be an integer between 1 and 180"),

  body("questions")
    .optional()
    .isArray({ min: 1, max: 50 })
    .withMessage("questions must be an array of 1 to 50 items")
    .custom(validateQuestions),

  body("description").optional().trim(),
];

module.exports = {
  validate,
  registerRules,
  loginRules,
  companyRules,
  updateCompanyRules,
  jobRules,
  updateJobRules,
  applyRules,
  statusChangeRules,
  assessmentRules,
  updateAssessmentRules,
};
