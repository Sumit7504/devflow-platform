const express = require("express");
const router = express.Router();

// GET /api/health — simple liveness check
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "DevFlow API is up and running",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
