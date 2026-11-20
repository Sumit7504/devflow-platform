const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const {
  validate,
  adminUserListRules,
  updateUserStatusRules,
  updateUserRoleRules,
  adminJobListRules,
} = require("../middleware/validators");

const {
  listUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  listAllJobs,
  closeJobAdmin,
  deleteJobAdmin,
  getAdminStats,
} = require("../controllers/adminController");

// ── All admin routes require authentication and admin role ────────────────────
router.use(auth, authorizeRoles("admin"));

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", getAdminStats);

// ── User Management ───────────────────────────────────────────────────────────
router.get("/users", adminUserListRules, validate, listUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id/status", updateUserStatusRules, validate, updateUserStatus);
router.patch("/users/:id/role", updateUserRoleRules, validate, updateUserRole);

// ── Job Management ────────────────────────────────────────────────────────────
router.get("/jobs", adminJobListRules, validate, listAllJobs);
router.patch("/jobs/:id/close", closeJobAdmin);
router.delete("/jobs/:id", deleteJobAdmin);

module.exports = router;
