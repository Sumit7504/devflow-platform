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

module.exports = { validate, registerRules, loginRules };
