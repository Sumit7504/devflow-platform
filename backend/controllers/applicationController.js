const mongoose = require("mongoose");
const Application = require("../models/Application");
const Job         = require("../models/Job");

// ── Population specs ──────────────────────────────────────────────────────────
// For candidate's /my list: job title + company name
const MY_POPULATE = {
  path: "job",
  select: "title company status",
  populate: { path: "company", select: "name" },
};

// For single-application detail: full job + candidate info
const DETAIL_POPULATE = [
  {
    path: "job",
    select: "title company postedBy status",
    populate: { path: "company", select: "name" },
  },
  { path: "candidate", select: "name email" },
  { path: "statusHistory.changedBy", select: "name role" },
];

// ── Safe pagination (same pattern as jobs) ────────────────────────────────────
const parsePagination = (query) => {
  const DEFAULT_PAGE = 1, DEFAULT_LIMIT = 10, MAX_LIMIT = 50;
  let page  = parseInt(query.page,  10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page)  || page  < 1) page  = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
};

// ── Shared helper: resolve an application by ID ───────────────────────────────
// Validates ObjectId format, finds + fully populates the application.
// Sends the error response itself and returns null on failure.
const resolveApplication = async (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: "Invalid application ID" });
    return null;
  }
  const app = await Application.findById(id).populate(DETAIL_POPULATE);
  if (!app) {
    res.status(404).json({ success: false, message: "Application not found" });
    return null;
  }
  return app;
};

// ── POST /api/applications ────────────────────────────────────────────────────
const apply = async (req, res, next) => {
  try {
    const { jobId, coverLetter, resumeUrl } = req.body;

    // 1. Job must exist
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // 2. Job must be open
    if (job.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "This job is no longer accepting applications",
      });
    }

    // 3. Deadline must not have passed
    if (job.deadline && new Date(job.deadline) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "The application deadline has passed",
      });
    }

    // 4. Create — candidate always from token, never body
    const application = await Application.create({
      job:         jobId,
      candidate:   req.user._id,
      coverLetter: coverLetter || "",
      resumeUrl:   resumeUrl   || "",
      // Seed statusHistory with the initial "applied" entry
      statusHistory: [{ status: "applied", changedBy: req.user._id }],
    });

    res.status(201).json({ success: true, application });
  } catch (err) {
    // Duplicate compound index → candidate already applied to this job
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already applied for this job",
      });
    }
    next(err);
  }
};

// ── GET /api/applications/my ──────────────────────────────────────────────────
const myApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ candidate: req.user._id })
      .populate(MY_POPULATE)
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: applications.length, applications });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/applications/job/:jobId ─────────────────────────────────────────
const jobApplicants = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    // Job must exist and belong to this recruiter
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    if (!job.postedBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view applicants for this job",
      });
    }

    const { page, limit, skip } = parsePagination(req.query);

    // Optional status filter — ignore unknown values
    const VALID_STATUSES = ["applied", "shortlisted", "rejected", "hired"];
    const filter = { job: jobId };
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("candidate", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      applications,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/applications/:id/status ───────────────────────────────────────
// All status-change logic lives here — single function, no helpers shared with other routes.
const changeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid application ID" });
    }

    // Populate job.postedBy to verify recruiter ownership
    const application = await Application.findById(id).populate("job", "postedBy title");
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    // Only the recruiter who posted the job may change status
    if (!application.job.postedBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to change the status of this application",
      });
    }

    // No-op guard — same value → 400 (note: "applied" is already blocked by validator)
    if (application.status === newStatus) {
      return res.status(400).json({
        success: false,
        message: `Status is already "${newStatus}"`,
      });
    }

    // Apply the change and append to audit trail
    application.status = newStatus;
    application.statusHistory.push({
      status:    newStatus,
      changedAt: new Date(),
      changedBy: req.user._id,
    });
    await application.save();

    res.status(200).json({ success: true, application });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/applications/:id ─────────────────────────────────────────────────
// Accessible by: the candidate who owns it OR the recruiter who posted the job.
const getApplicationById = async (req, res, next) => {
  try {
    const application = await resolveApplication(req.params.id, res);
    if (!application) return; // response already sent

    const isOwningCandidate = application.candidate._id.equals(req.user._id);
    const isOwningRecruiter = application.job.postedBy.equals(req.user._id);

    if (!isOwningCandidate && !isOwningRecruiter) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this application",
      });
    }

    res.status(200).json({ success: true, application });
  } catch (err) {
    next(err);
  }
};

module.exports = { apply, myApplications, jobApplicants, changeStatus, getApplicationById };
