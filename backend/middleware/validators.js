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

module.exports = { validate, registerRules, loginRules, companyRules, updateCompanyRules };
