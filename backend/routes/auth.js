const express = require("express");
const router = express.Router();

const { register, login, getMe } = require("../controllers/authController");
const auth = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const { registerRules, loginRules, validate } = require("../middleware/validators");

// Public routes
router.post("/register", registerRules, validate, register);
router.post("/login",    loginRules,    validate, login);

// Protected — any logged-in user
router.get("/me", auth, getMe);

// Protected — admin only (test route for RBAC)
router.get("/admin-only", auth, authorizeRoles("admin"), (req, res) => {
  res.status(200).json({ success: true, message: `Welcome, admin ${req.user.name}` });
});

module.exports = router;
