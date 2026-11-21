const express = require("express");
const router = express.Router();

const { register, login, getMe } = require("../controllers/authController");
const auth = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const { registerRules, loginRules, validate } = require("../middleware/validators");
const { loginLimiter, registerLimiter } = require("../middleware/rateLimiters");

// Public routes
router.post("/register", registerLimiter, registerRules, validate, register);
router.post("/login", loginLimiter, loginRules, validate, login);

// Protected — any logged-in user
router.get("/me", auth, getMe);

// Protected — admin only (test route for RBAC)
router.get("/admin-only", auth, authorizeRoles("admin"), (req, res) => {
  res.status(200).json({ success: true, message: `Welcome, admin ${req.user.name}` });
});

module.exports = router;
