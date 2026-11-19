const mongoose = require("mongoose");
const Job     = require("../models/Job");
const Company = require("../models/Company");

// ── Shared population spec (used in list + detail) ────────────────────────────
const COMPANY_POPULATE = { path: "company", select: "name location logo" };

// ── Escape regex special characters to safely use user input in RegExp ────────
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Ownership helper ──────────────────────────────────────────────────────────
// Finds a job by ID, validates format, checks existence, checks ownership.
// Returns { job } on success or sends the appropriate error response.
const findOwnJob = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: "Invalid job ID" });
    return null;
  }

  const job = await Job.findById(id);

  if (!job) {
    res.status(404).json({ success: false, message: "Job not found" });
    return null;
  }

  // postedBy is stored as ObjectId — compare using .equals() for safety
  if (!job.postedBy.equals(req.user._id)) {
    res.status(403).json({ success: false, message: "You are not authorized to modify this job" });
    return null;
  }

  return job;
};

// ── POST /api/jobs ────────────────────────────────────────────────────────────
const createJob = async (req, res, next) => {
  try {
    // Auto-link company from the logged-in recruiter; never trust the body
    const company = await Company.findOne({ owner: req.user._id });
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "You must create a company before posting a job.",
      });
    }

    // Strip fields that must never come from the request body
    const { company: _c, postedBy: _p, status: _s, ...fields } = req.body;

    const job = await Job.create({
      ...fields,
      company:  company._id,
      postedBy: req.user._id,
      // status defaults to "open" via schema
    });

    // Populate company details for the response
    await job.populate(COMPANY_POPULATE);

    res.status(201).json({ success: true, job });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/jobs/my ──────────────────────────────────────────────────────────
const listMyJobs = async (req, res, next) => {
  try {
    const jobs = await Job.find({ postedBy: req.user._id })
      .populate(COMPANY_POPULATE)
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
const listJobs = async (req, res, next) => {
  try {
    // ── Pagination — fall back to defaults for missing or invalid values ──────
    const DEFAULT_PAGE  = 1;
    const DEFAULT_LIMIT = 10;
    const MAX_LIMIT     = 50;

    let page  = parseInt(req.query.page,  10);
    let limit = parseInt(req.query.limit, 10);

    if (!Number.isFinite(page)  || page  < 1) page  = DEFAULT_PAGE;
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const skip = (page - 1) * limit;

    // ── Filters ───────────────────────────────────────────────────────────────
    const filter = { status: "open" };

    if (req.query.keyword) {
      filter.title = { $regex: escapeRegex(req.query.keyword), $options: "i" };
    }

    if (req.query.location) {
      filter.location = { $regex: escapeRegex(req.query.location), $options: "i" };
    }

    if (req.query.jobType) {
      filter.jobType = req.query.jobType; // exact match against enum
    }

    // ── Query ─────────────────────────────────────────────────────────────────
    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate(COMPANY_POPULATE)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Job.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      jobs,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/jobs/:id ─────────────────────────────────────────────────────────
const getJobById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    const job = await Job.findById(req.params.id).populate(COMPANY_POPULATE);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    res.status(200).json({ success: true, job });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/jobs/:id ─────────────────────────────────────────────────────────
const updateJob = async (req, res, next) => {
  try {
    const job = await findOwnJob(req, res);
    if (!job) return; // response already sent by helper

    // Strip protected fields — status changes go through PATCH /:id/close only
    const { company: _c, postedBy: _p, status: _s, ...updates } = req.body;

    Object.assign(job, updates);
    await job.save(); // triggers schema validators (e.g. salaryMin/Max via model)

    await job.populate(COMPANY_POPULATE);

    res.status(200).json({ success: true, job });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/jobs/:id/close ─────────────────────────────────────────────────
const closeJob = async (req, res, next) => {
  try {
    const job = await findOwnJob(req, res);
    if (!job) return;

    if (job.status === "closed") {
      return res.status(400).json({ success: false, message: "Job is already closed" });
    }

    job.status = "closed";
    await job.save();

    res.status(200).json({ success: true, message: "Job closed successfully", job });
  } catch (err) {
    next(err);
  }
};

module.exports = { createJob, listMyJobs, listJobs, getJobById, updateJob, closeJob };
