const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const { validate, notificationListRules } = require("../middleware/validators");
const {
  listMyNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  deleteNotification,
} = require("../controllers/notificationController");

// All notification routes require authentication (available to any role)
router.use(auth);

// ── Specific named routes must be declared before parameterized /:id routes ──
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);

// ── Notification list & item routes ──────────────────────────────────────────
router.get("/", notificationListRules, validate, listMyNotifications);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

module.exports = router;
