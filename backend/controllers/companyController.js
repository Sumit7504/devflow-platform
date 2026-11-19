const mongoose = require("mongoose");
const Company = require("../models/Company");

// ── POST /api/companies ───────────────────────────────────────────────────────
const createCompany = async (req, res, next) => {
  try {
    const company = await Company.create({
      owner: req.user._id, // always taken from the token, never from the body
      ...req.body,
    });

    res.status(201).json({ success: true, company });
  } catch (err) {
    // Duplicate key on the unique owner index → recruiter already has a company
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You already have a company. Use PUT /api/companies/me to update it.",
      });
    }
    next(err);
  }
};

// ── GET /api/companies/me ─────────────────────────────────────────────────────
const getMyCompany = async (req, res, next) => {
  try {
    const company = await Company.findOne({ owner: req.user._id });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "You have not created a company yet.",
      });
    }

    res.status(200).json({ success: true, company });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/companies/me ─────────────────────────────────────────────────────
const updateMyCompany = async (req, res, next) => {
  try {
    // Strip owner from body — a recruiter must never reassign ownership
    const { owner, ...updates } = req.body;

    const company = await Company.findOneAndUpdate(
      { owner: req.user._id }, // scoped to the requesting recruiter
      updates,
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "You have not created a company yet.",
      });
    }

    res.status(200).json({ success: true, company });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/companies/:id ────────────────────────────────────────────────────
const getCompanyById = async (req, res, next) => {
  try {
    // Validate the ID format before hitting the DB
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid company ID" });
    }

    const company = await Company.findById(req.params.id).populate(
      "owner",
      "name email" // only expose safe owner fields
    );

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    res.status(200).json({ success: true, company });
  } catch (err) {
    next(err);
  }
};

module.exports = { createCompany, getMyCompany, updateMyCompany, getCompanyById };
