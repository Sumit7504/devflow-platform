const mongoose   = require("mongoose");
const Assessment = require("../models/Assessment");
const Job        = require("../models/Job");
const Application = require("../models/Application");
const Attempt    = require("../models/Attempt");

// ── Candidate-safe response builder ──────────────────────────────────────────
// Returns only the fields a candidate is allowed to see:
//   - _id, title, description, durationMinutes
//   - questions: _id, type, text, points, options (mcq only)
//   - correctOption is NEVER included for any question type
//   - For code questions: options is also excluded
//   - job, createdBy, postedBy are never included
const sanitizeForCandidate = (doc) => {
  const plain = doc.toObject();
  return {
    _id:             plain._id,
    title:           plain.title,
    description:     plain.description,
    durationMinutes: plain.durationMinutes,
    questions: plain.questions.map((q) => {
      const sanitized = {
        _id:    q._id,
        type:   q.type,
        text:   q.text,
        points: q.points,
      };
      // MCQ candidates need the options to pick from, but never the correct answer
      if (q.type === "mcq") sanitized.options = q.options;
      // code: neither options nor correctOption
      return sanitized;
    }),
  };
};

// ── Access-control helper (used by both GET routes) ───────────────────────────
// Fetches and validates access for the given assessment document.
// Assessment must already be populated: job { _id, postedBy }.
//
// Access rules:
//   RECRUITER  → must be the recruiter who posted the job (job.postedBy === req.user._id)
//   CANDIDATE  → must have an application for the job whose status is NOT "rejected"
//                (rejected candidates lose access to the assessment)
//   ADMIN/other→ 403
//
// Returns { isRecruiter: bool } on success, or null after sending a 403.
const resolveAccess = async (assessment, req, res) => {
  const { role } = req.user;

  if (role === "recruiter") {
    if (!assessment.job.postedBy.equals(req.user._id)) {
      res.status(403).json({ success: false, message: "You are not authorized to access this assessment" });
      return null;
    }
    return { isRecruiter: true };
  }

  if (role === "candidate") {
    // Any non-rejected application counts — applied, shortlisted, or hired
    const app = await Application.findOne({
      job:       assessment.job._id,
      candidate: req.user._id,
      status:    { $ne: "rejected" },
    });
    if (!app) {
      res.status(403).json({ success: false, message: "You are not authorized to access this assessment" });
      return null;
    }
    return { isRecruiter: false };
  }

  res.status(403).json({ success: false, message: "You are not authorized to access this assessment" });
  return null;
};

// ── POST /api/assessments ─────────────────────────────────────────────────────
const createAssessment = async (req, res, next) => {
  try {
    const { jobId, job: _j, createdBy: _c, ...rest } = req.body;

    // Job must exist and be owned by this recruiter
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid jobId" });
    }
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    if (!job.postedBy.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only create assessments for your own jobs" });
    }

    const assessment = await Assessment.create({
      ...rest,
      job:       jobId,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, assessment });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "An assessment already exists for this job" });
    }
    next(err);
  }
};

// ── GET /api/assessments/job/:jobId ──────────────────────────────────────────
const getByJobId = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    const assessment = await Assessment.findOne({ job: jobId })
      .populate("job", "postedBy _id");

    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found for this job" });
    }

    const access = await resolveAccess(assessment, req, res);
    if (!access) return; // 403 already sent

    if (access.isRecruiter) {
      return res.status(200).json({ success: true, assessment });
    }
    return res.status(200).json({ success: true, assessment: sanitizeForCandidate(assessment) });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/assessments/:id ──────────────────────────────────────────────────
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid assessment ID" });
    }

    const assessment = await Assessment.findById(id)
      .populate("job", "postedBy _id");

    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    const access = await resolveAccess(assessment, req, res);
    if (!access) return;

    if (access.isRecruiter) {
      return res.status(200).json({ success: true, assessment });
    }
    return res.status(200).json({ success: true, assessment: sanitizeForCandidate(assessment) });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/assessments/:id ──────────────────────────────────────────────────
const updateAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid assessment ID" });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    // Only the recruiter who created the assessment may update it
    if (!assessment.createdBy.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not authorized to update this assessment" });
    }

    // Strip protected fields — job, jobId and createdBy must never change
    const { job: _j, jobId: _jid, createdBy: _c, ...updates } = req.body;

    // If candidate attempts exist, block changing questions and durationMinutes (keep scores meaningful)
    const hasAttempts = await Attempt.exists({ assessment: id });
    if (hasAttempts) {
      if (req.body.questions !== undefined) {
        return res.status(409).json({
          success: false,
          message: "Cannot modify questions because candidate attempts exist for this assessment",
        });
      }
      if (req.body.durationMinutes !== undefined) {
        return res.status(409).json({
          success: false,
          message: "Cannot modify durationMinutes because candidate attempts exist for this assessment",
        });
      }
    }

    Object.assign(assessment, updates);
    await assessment.save();

    res.status(200).json({ success: true, assessment });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/assessments/:id ───────────────────────────────────────────────
const deleteAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid assessment ID" });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    if (!assessment.createdBy.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not authorized to delete this assessment" });
    }

    // Block deletion if candidate attempts exist
    const hasAttempts = await Attempt.exists({ assessment: id });
    if (hasAttempts) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete assessment because candidate attempts exist",
      });
    }

    await assessment.deleteOne();
    res.status(200).json({ success: true, message: "Assessment deleted successfully" });
  } catch (err) {
    next(err);
  }
};

module.exports = { createAssessment, getByJobId, getById, updateAssessment, deleteAssessment };
