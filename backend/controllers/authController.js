const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Sign a JWT containing minimal, non-sensitive claims
const signToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    // Role defaults to "candidate" if omitted; validator already blocks "admin"
    const user = await User.create({ name, email, password, role });

    const token = signToken(user._id, user.role);

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Select password explicitly because schema has select: false
    const user = await User.findOne({ email }).select("+password");

    // Same message for wrong email OR wrong password — prevents user enumeration
    const invalid = () =>
      res.status(401).json({ success: false, message: "Invalid email or password" });

    if (!user) return invalid();
    const match = await user.matchPassword(password);
    if (!match) return invalid();

    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    const token = signToken(user._id, user.role);

    res.status(200).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive !== false },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  // req.user is already attached by the auth middleware (no password field)
  const { _id, name, email, role, isActive, createdAt } = req.user;
  res.status(200).json({
    success: true,
    user: { id: _id, name, email, role, isActive: isActive !== false, createdAt },
  });
};

module.exports = { register, login, getMe };
