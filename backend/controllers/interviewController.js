const mongoose    = require("mongoose");
const Interview   = require("../models/Interview");
const Application = require("../models/Application");
const { notify }  = require("../services/notificationService");

// ── Note on Concurrency & Race Windows ───────────────────────────────────────
// In interview scheduling, overlapping checks query existing confirmed selectedSlots.
// There is a small theoretical race window between when the overlap check runs
// and when an atomic status update transitions to "confirmed".
// The database maintains integrity via partial unique indexes on active applications,
// atomic findOneAndUpdate filters on status, and pre-confirmation re-validation.

// ── Safe pagination helper ───────────────────────────────────────────────────
const parsePagination = (query) => {
  const DEFAULT_PAGE = 1, DEFAULT_LIMIT = 10, MAX_LIMIT = 50;
  let page  = parseInt(query.page,  10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page)  || page  < 1) page  = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
};

// ── Overlap helper for confirmed interviews ──────────────────────────────────
// Checks if a slot [start, end] overlaps with any confirmed interview's selectedSlot
// for the given recruiter or candidate, excluding a specified interview ID.
const checkConfirmedOverlap = async ({ recruiterId, candidateId, start, end, excludeId = null }) => {
  const filter = {
    status: "confirmed",
    $or: [{ recruiter: recruiterId }, { candidate: candidateId }],
    "selectedSlot.start": { $lt: end },
    "selectedSlot.end":   { $gt: start },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return await Interview.exists(filter);
};

// ── POST /api/interviews ──────────────────────────────────────────────────────
// Recruiter creates/proposes an interview for a shortlisted candidate.
const createInterview = async (req, res, next) => {
  try {
    const { applicationId, mode, slots, meetingLink, location, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ success: false, message: "Invalid applicationId" });
    }

    const application = await Application.findById(applicationId).populate("job", "postedBy");
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    // Recruiter must own the job
    if (!application.job.postedBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to schedule an interview for this application",
      });
    }

    // Application status must be "shortlisted"
    if (application.status !== "shortlisted") {
      return res.status(400).json({
        success: false,
        message: "Application must be shortlisted to schedule an interview",
      });
    }

    // Check for an active interview (proposed or confirmed) on this application
    const existingActive = await Interview.findOne({
      application: applicationId,
      status: { $in: ["proposed", "confirmed"] },
    });
    if (existingActive) {
      return res.status(409).json({
        success: false,
        message: "An active interview already exists for this application",
      });
    }

    // Validate slots array (1 to 5)
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 5) {
      return res.status(400).json({
        success: false,
        message: "slots must be an array of 1 to 5 slot objects",
      });
    }

    const parsedSlots = [];
    const now = new Date();

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || !s.start || !s.end) {
        return res.status(400).json({
          success: false,
          message: `slots[${i}]: start and end dates are required`,
        });
      }

      const startDate = new Date(s.start);
      const endDate   = new Date(s.end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: `slots[${i}]: start and end must be valid ISO 8601 dates`,
        });
      }

      // Slot must start in the future
      if (startDate <= now) {
        return res.status(400).json({
          success: false,
          message: `slots[${i}]: start must be in the future`,
        });
      }

      // Slot end must be after start
      if (endDate <= startDate) {
        return res.status(400).json({
          success: false,
          message: `slots[${i}]: end must be after start`,
        });
      }

      // Duration: 15 to 240 minutes
      const durationMinutes = (endDate.getTime() - startDate.getTime()) / (60 * 1000);
      if (durationMinutes < 15 || durationMinutes > 240) {
        return res.status(400).json({
          success: false,
          message: `slots[${i}]: duration must be between 15 and 240 minutes`,
        });
      }

      parsedSlots.push({ start: startDate, end: endDate });
    }

    // Validate proposed slots do not overlap each other
    for (let i = 0; i < parsedSlots.length; i++) {
      for (let j = i + 1; j < parsedSlots.length; j++) {
        if (parsedSlots[i].start < parsedSlots[j].end && parsedSlots[i].end > parsedSlots[j].start) {
          return res.status(400).json({
            success: false,
            message: `Proposed slots ${i + 1} and ${j + 1} overlap each other`,
          });
        }
      }
    }

    // Validate proposed slots do not overlap any confirmed interview of recruiter or candidate
    for (let i = 0; i < parsedSlots.length; i++) {
      const slot = parsedSlots[i];
      const overlap = await checkConfirmedOverlap({
        recruiterId: req.user._id,
        candidateId: application.candidate,
        start: slot.start,
        end: slot.end,
      });

      if (overlap) {
        return res.status(409).json({
          success: false,
          message: `Proposed slot ${i + 1} overlaps an existing confirmed interview`,
        });
      }
    }

    // Create interview with initial statusHistory
    const interview = await Interview.create({
      application:   applicationId,
      job:           application.job._id,
      candidate:     application.candidate,
      recruiter:     req.user._id,
      mode,
      meetingLink:   meetingLink || "",
      location:      location || "",
      notes:         notes || "",
      proposedSlots: parsedSlots,
      status:        "proposed",
      statusHistory: [
        {
          status:    "proposed",
          changedAt: new Date(),
          changedBy: req.user._id,
        },
      ],
    });

    const populated = await Interview.findById(interview._id)
      .populate("candidate", "name email")
      .populate("recruiter", "name email")
      .populate("job", "title");

    res.status(201).json({ success: true, interview: populated });

    // Real-time notification: notify candidate of proposed interview
    notify(populated.candidate._id || populated.candidate, {
      type: "interview_proposed",
      title: "Interview Proposed",
      message: `An interview has been proposed for ${populated.job.title}`,
      data: { interview: populated._id, job: populated.job._id, application: populated.application },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An active interview already exists for this application",
      });
    }
    next(err);
  }
};

// ── GET /api/interviews/recruiter ─────────────────────────────────────────────
// Recruiter lists their interviews with candidate name/email and job title.
const getRecruiterInterviews = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { recruiter: req.user._id };
    const VALID_STATUSES = ["proposed", "confirmed", "declined", "cancelled"];
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [interviews, total] = await Promise.all([
      Interview.find(filter)
        .populate("candidate", "name email")
        .populate("job", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Interview.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      interviews,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/interviews/my ────────────────────────────────────────────────────
// Candidate lists their interviews with job title and company name.
const getCandidateInterviews = async (req, res, next) => {
  try {
    const interviews = await Interview.find({ candidate: req.user._id })
      .populate({
        path: "job",
        select: "title company",
        populate: { path: "company", select: "name" },
      })
      .populate("recruiter", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: interviews.length,
      interviews,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/interviews/:id ───────────────────────────────────────────────────
// Accessible by the candidate who owns it or the recruiter who owns it.
const getInterviewById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid interview ID" });
    }

    const interview = await Interview.findById(id)
      .populate("candidate", "name email")
      .populate("recruiter", "name email")
      .populate({
        path: "job",
        select: "title company",
        populate: { path: "company", select: "name" },
      })
      .populate("application", "status");

    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    const isCandidate = interview.candidate._id.equals(req.user._id);
    const isRecruiter = interview.recruiter._id.equals(req.user._id);

    if (!isCandidate && !isRecruiter) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this interview",
      });
    }

    res.status(200).json({ success: true, interview });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/interviews/:id/confirm ─────────────────────────────────────────
// Candidate confirms a proposed interview by slotIndex.
// Single function; atomic update; hooks for Socket.IO in Phase 4.
const confirmInterview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { slotIndex } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid interview ID" });
    }

    const interview = await Interview.findById(id).populate("application");
    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    if (!interview.candidate.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to confirm this interview",
      });
    }

    if (interview.status !== "proposed") {
      return res.status(400).json({
        success: false,
        message: "Interview is not in proposed status",
      });
    }

    // Re-check on confirm that the application is still shortlisted
    if (!interview.application || interview.application.status !== "shortlisted") {
      return res.status(400).json({
        success: false,
        message: "Application is no longer shortlisted",
      });
    }

    // Validate slotIndex
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= interview.proposedSlots.length) {
      return res.status(400).json({
        success: false,
        message: `slotIndex must be an integer between 0 and ${interview.proposedSlots.length - 1}`,
      });
    }

    const chosenSlot = interview.proposedSlots[slotIndex];

    // Chosen slot must still be in the future
    if (new Date(chosenSlot.start) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "The selected interview slot is no longer in the future",
      });
    }

    // Re-check overlap against recruiter's and candidate's confirmed interviews
    const overlap = await checkConfirmedOverlap({
      recruiterId: interview.recruiter,
      candidateId: req.user._id,
      start: chosenSlot.start,
      end:   chosenSlot.end,
      excludeId: interview._id,
    });

    if (overlap) {
      return res.status(409).json({
        success: false,
        message: "Selected slot overlaps an existing confirmed interview",
      });
    }

    // Atomic update matching status "proposed" prevents double confirmation
    const confirmed = await Interview.findOneAndUpdate(
      {
        _id: id,
        candidate: req.user._id,
        status: "proposed",
      },
      {
        $set: {
          status: "confirmed",
          selectedSlot: {
            start: chosenSlot.start,
            end:   chosenSlot.end,
          },
        },
        $push: {
          statusHistory: {
            status:    "confirmed",
            changedAt: new Date(),
            changedBy: req.user._id,
          },
        },
      },
      { new: true }
    )
      .populate("candidate", "name email")
      .populate("recruiter", "name email")
      .populate("job", "title");

    if (!confirmed) {
      return res.status(400).json({
        success: false,
        message: "Interview is no longer in proposed status",
      });
    }

    res.status(200).json({ success: true, interview: confirmed });

    // Real-time notification: notify recruiter of confirmed interview
    notify(confirmed.recruiter._id || confirmed.recruiter, {
      type: "interview_confirmed",
      title: "Interview Confirmed",
      message: `${req.user.name} confirmed the interview for ${confirmed.job.title}`,
      data: { interview: confirmed._id, job: confirmed.job._id, application: confirmed.application },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/interviews/:id/decline ─────────────────────────────────────────
// Candidate declines a proposed interview.
// Single function; atomic update; hooks for Socket.IO in Phase 4.
const declineInterview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid interview ID" });
    }

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    if (!interview.candidate.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to decline this interview",
      });
    }

    if (interview.status !== "proposed") {
      return res.status(400).json({
        success: false,
        message: "Only proposed interviews can be declined",
      });
    }

    const declined = await Interview.findOneAndUpdate(
      {
        _id: id,
        candidate: req.user._id,
        status: "proposed",
      },
      {
        $set: { status: "declined" },
        $push: {
          statusHistory: {
            status:    "declined",
            changedAt: new Date(),
            changedBy: req.user._id,
          },
        },
      },
      { new: true }
    )
      .populate("candidate", "name email")
      .populate("recruiter", "name email")
      .populate("job", "title");

    if (!declined) {
      return res.status(400).json({
        success: false,
        message: "Interview is no longer in proposed status",
      });
    }

    res.status(200).json({ success: true, interview: declined });

    // Real-time notification: notify recruiter of declined interview
    notify(declined.recruiter._id || declined.recruiter, {
      type: "interview_declined",
      title: "Interview Declined",
      message: `${req.user.name} declined the interview for ${declined.job.title}`,
      data: { interview: declined._id, job: declined.job._id, application: declined.application },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/interviews/:id/cancel ──────────────────────────────────────────
// Recruiter cancels a proposed or confirmed interview.
// Single function; atomic update; hooks for Socket.IO in Phase 4.
const cancelInterview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid interview ID" });
    }

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    if (!interview.recruiter.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this interview",
      });
    }

    if (!["proposed", "confirmed"].includes(interview.status)) {
      return res.status(400).json({
        success: false,
        message: "Only proposed or confirmed interviews can be cancelled",
      });
    }

    const cancelled = await Interview.findOneAndUpdate(
      {
        _id: id,
        recruiter: req.user._id,
        status: { $in: ["proposed", "confirmed"] },
      },
      {
        $set: { status: "cancelled" },
        $push: {
          statusHistory: {
            status:    "cancelled",
            changedAt: new Date(),
            changedBy: req.user._id,
          },
        },
      },
      { new: true }
    )
      .populate("candidate", "name email")
      .populate("recruiter", "name email")
      .populate("job", "title");

    if (!cancelled) {
      return res.status(400).json({
        success: false,
        message: "Interview cannot be cancelled",
      });
    }

    res.status(200).json({ success: true, interview: cancelled });

    // Real-time notification: notify candidate of cancelled interview
    notify(cancelled.candidate._id || cancelled.candidate, {
      type: "interview_cancelled",
      title: "Interview Cancelled",
      message: `The interview for ${cancelled.job.title} has been cancelled`,
      data: { interview: cancelled._id, job: cancelled.job._id, application: cancelled.application },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createInterview,
  getRecruiterInterviews,
  getCandidateInterviews,
  getInterviewById,
  confirmInterview,
  declineInterview,
  cancelInterview,
};
