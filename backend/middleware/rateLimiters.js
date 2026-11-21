const rateLimit = require("express-rate-limit");

// Configurable rate limit toggles (cannot be disabled in production)
const isRateLimitDisabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.DISABLE_RATE_LIMIT === "true" || process.env.NODE_ENV === "test");

// General rate limiter for /api routes (default ~600 requests per 15 min)
const generalLimiter = isRateLimitDisabled
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_GENERAL, 10) || 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many requests. Please slow down and try again later.",
      },
    });

// Strict limiter for POST /api/auth/login
// skipSuccessfulRequests: true ensures only failed login attempts are counted against the limit
const loginLimiter = isRateLimitDisabled
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_AUTH, 10) || 10,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many failed login attempts. Please try again after 15 minutes.",
      },
    });

// Strict limiter for POST /api/auth/register
const registerLimiter = isRateLimitDisabled
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_AUTH, 10) || 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many registration attempts. Please try again after 15 minutes.",
      },
    });

module.exports = {
  generalLimiter,
  loginLimiter,
  registerLimiter,
};
