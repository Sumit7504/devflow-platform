const mongoose   = require("mongoose");
const Attempt    = require("../models/Attempt");
const Assessment = require("../models/Assessment");
const Application = require("../models/Application");
const { notify } = require("../services/notificationService");

// ── Comment on Abandoned Attempts ────────────────────────────────────────────
// In an online assessment platform, candidates may start an attempt but fail to
// submit due to closing the window, network failure, or walking away.
// These attempts remain in the "in_progress" status in MongoDB.
// When the candidate later attempts to submit, the server checks the deadline
// (startedAt + durationMinutes + grace period) and firmly rejects expired attempts with 400.
// In production or scheduled background cron jobs, administrators can query
// Attempt.find({ status: "in_progress", startedAt: { $lt: expiryTime } })
// and auto-close or flag them as "abandoned" with 0 score.

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

// ── Sanitize attempt response for candidates ─────────────────────────────────
// Ensures correctOption is NEVER returned to candidate under any circumstance.
const sanitizeAttemptForCandidate = (attemptDoc, assessmentDoc) => {
  const a = attemptDoc.toObject ? attemptDoc.toObject() : attemptDoc;
  const durationMinutes = assessmentDoc ? assessmentDoc.durationMinutes : (a.assessment && a.assessment.durationMinutes ? a.assessment.durationMinutes : 0);
  const deadline = new Date(new Date(a.startedAt).getTime() + durationMinutes * 60 * 1000);

  return {
    _id: a._id,
    assessment: a.assessment ? (a.assessment._id || a.assessment) : undefined,
    candidate: a.candidate ? (a.candidate._id || a.candidate) : undefined,
    status: a.status,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    deadline,
    answers: (a.answers || []).map((ans) => ({
      _id: ans._id,
      question: ans.question,
      selectedOption: ans.selectedOption,
      codeAnswer: ans.codeAnswer,
      pointsAwarded: ans.pointsAwarded,
      feedback: ans.feedback,
    })),
    mcqScore: a.mcqScore,
    codeScore: a.codeScore,
    totalScore: a.totalScore,
    maxScore: a.maxScore,
    gradedAt: a.gradedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
};

// ── POST /api/attempts/start ──────────────────────────────────────────────────
// Candidate starts an attempt. Returns attempt ID, startedAt, and server-computed deadline.
const startAttempt = async (req, res, next) => {
  try {
    const { assessmentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(assessmentId)) {
      return res.status(400).json({ success: false, message: "Invalid assessment ID" });
    }

    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    // Candidate must hold an application for this assessment's job that is NOT rejected
    const application = await Application.findOne({
      job: assessment.job,
      candidate: req.user._id,
      status: { $ne: "rejected" },
    });

    if (!application) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to attempt this assessment",
      });
    }

    // Pre-check for duplicate attempt
    const existing = await Attempt.findOne({
      assessment: assessmentId,
      candidate: req.user._id,
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already started an attempt for this assessment",
      });
    }

    const startedAt = new Date();
    const attempt = await Attempt.create({
      assessment: assessmentId,
      candidate: req.user._id,
      status: "in_progress",
      startedAt,
    });

    const deadline = new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000);

    res.status(201).json({
      success: true,
      attempt: {
        _id: attempt._id,
        startedAt,
        deadline,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already started an attempt for this assessment",
      });
    }
    next(err);
  }
};

// ── POST /api/attempts/:id/submit ─────────────────────────────────────────────
// Entire submit logic in this single function.
// Uses atomic findOneAndUpdate with status: "in_progress" so double submits fail with 400.
const submitAttempt = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid attempt ID" });
    }

    const attempt = await Attempt.findById(id);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    // Must belong to the calling candidate
    if (!attempt.candidate.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to submit this attempt",
      });
    }

    // Check status before expensive checks
    if (attempt.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Attempt has already been submitted",
      });
    }

    // Fetch assessment for questions, duration, and scoring
    const assessment = await Assessment.findById(attempt.assessment);
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    // Reject if time is up (durationMinutes + 60 seconds grace)
    const durationMs = assessment.durationMinutes * 60 * 1000;
    const graceMs    = 60 * 1000;
    const timeLimit  = new Date(attempt.startedAt.getTime() + durationMs + graceMs);
    if (new Date() > timeLimit) {
      return res.status(400).json({
        success: false,
        message: "Assessment time limit has expired",
      });
    }

    // ── Strict answers validation ─────────────────────────────────────────────
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: "answers must be an array" });
    }

    // Map questions by string representation of _id
    const qMap = new Map();
    let maxScore = 0;
    let hasCodeQuestions = false;
    for (const q of assessment.questions) {
      qMap.set(q._id.toString(), q);
      maxScore += q.points;
      if (q.type === "code") hasCodeQuestions = true;
    }

    const seenQuestionIds = new Set();
    const processedAnswers = [];
    let mcqScore = 0;

    for (let i = 0; i < answers.length; i++) {
      const ans = answers[i];
      if (!ans || !ans.question) {
        return res.status(400).json({
          success: false,
          message: `answers[${i}]: question ID is required`,
        });
      }

      const qIdStr = ans.question.toString();
      if (!mongoose.Types.ObjectId.isValid(qIdStr)) {
        return res.status(400).json({
          success: false,
          message: `answers[${i}]: Invalid question ID: ${qIdStr}`,
        });
      }

      // No duplicate question IDs compared as strings
      if (seenQuestionIds.has(qIdStr)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate answer submitted for question: ${qIdStr}`,
        });
      }
      seenQuestionIds.add(qIdStr);

      const q = qMap.get(qIdStr);
      if (!q) {
        return res.status(400).json({
          success: false,
          message: `Question ${qIdStr} does not belong to this assessment`,
        });
      }

      if (q.type === "mcq") {
        if (ans.codeAnswer !== undefined && ans.codeAnswer !== null) {
          return res.status(400).json({
            success: false,
            message: `Question ${qIdStr} is an MCQ and cannot accept codeAnswer`,
          });
        }
        if (ans.selectedOption === undefined || ans.selectedOption === null || !Number.isInteger(ans.selectedOption)) {
          return res.status(400).json({
            success: false,
            message: `Question ${qIdStr} must specify an integer selectedOption`,
          });
        }
        if (ans.selectedOption < 0 || ans.selectedOption >= q.options.length) {
          return res.status(400).json({
            success: false,
            message: `selectedOption for question ${qIdStr} is out of range (0 to ${q.options.length - 1})`,
          });
        }

        // Auto-score MCQ
        const isCorrect = ans.selectedOption === q.correctOption;
        const pointsAwarded = isCorrect ? q.points : 0;
        mcqScore += pointsAwarded;

        processedAnswers.push({
          question: q._id,
          selectedOption: ans.selectedOption,
          pointsAwarded,
          feedback: "",
        });
      } else if (q.type === "code") {
        if (ans.selectedOption !== undefined && ans.selectedOption !== null) {
          return res.status(400).json({
            success: false,
            message: `Question ${qIdStr} is a code question and cannot accept selectedOption`,
          });
        }
        const codeAnswer = typeof ans.codeAnswer === "string" ? ans.codeAnswer : "";
        if (codeAnswer.length > 10000) {
          return res.status(400).json({
            success: false,
            message: `codeAnswer for question ${qIdStr} exceeds maximum 10000 characters`,
          });
        }

        processedAnswers.push({
          question: q._id,
          codeAnswer,
          pointsAwarded: 0,
          feedback: "",
        });
      }
    }

    const submittedAt = new Date();
    // If no code questions exist, auto-grade immediately; otherwise wait for recruiter grading
    const finalStatus = hasCodeQuestions ? "submitted" : "graded";
    const totalScore = mcqScore;

    // ── Atomic update with findOneAndUpdate ──────────────────────────────────
    // Guarantees double-submits fail with 400 even under concurrent requests
    const updatedAttempt = await Attempt.findOneAndUpdate(
      {
        _id: attempt._id,
        candidate: req.user._id,
        status: "in_progress",
      },
      {
        $set: {
          answers: processedAnswers,
          status: finalStatus,
          submittedAt,
          mcqScore,
          codeScore: 0,
          totalScore,
          maxScore,
          ...(finalStatus === "graded" && { gradedAt: submittedAt }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedAttempt) {
      return res.status(400).json({
        success: false,
        message: "Attempt has already been submitted",
      });
    }

    res.status(200).json({
      success: true,
      attempt: sanitizeAttemptForCandidate(updatedAttempt, assessment),
    });

    // Real-time notifications: candidate graded & recruiter submitted
    if (finalStatus === "graded") {
      notify(req.user._id, {
        type: "assessment_graded",
        title: "Assessment Graded",
        message: `Your assessment for ${assessment.title} has been graded: ${updatedAttempt.totalScore}/${updatedAttempt.maxScore} points`,
        data: { attempt: updatedAttempt._id, job: assessment.job },
      });
      notify(assessment.createdBy, {
        type: "assessment_submitted",
        title: "Assessment Submitted",
        message: `${req.user.name} submitted an assessment for ${assessment.title} (Score: ${updatedAttempt.totalScore}/${updatedAttempt.maxScore})`,
        data: { attempt: updatedAttempt._id, job: assessment.job },
      });
    } else {
      notify(assessment.createdBy, {
        type: "assessment_submitted",
        title: "Assessment Submitted",
        message: `${req.user.name} submitted an assessment for ${assessment.title}`,
        data: { attempt: updatedAttempt._id, job: assessment.job },
      });
    }
  } catch (err) {
    next(err);
  }
};

// ── GET /api/attempts/my ──────────────────────────────────────────────────────
// Candidate views their own attempts list, newest first, with titles populated.
const myAttempts = async (req, res, next) => {
  try {
    const attempts = await Attempt.find({ candidate: req.user._id })
      .populate({
        path: "assessment",
        select: "title durationMinutes job",
        populate: { path: "job", select: "title" },
      })
      .sort({ createdAt: -1 });

    const formatted = attempts.map((a) => {
      const duration = a.assessment ? a.assessment.durationMinutes : 0;
      const deadline = new Date(new Date(a.startedAt).getTime() + duration * 60 * 1000);
      return {
        _id: a._id,
        assessment: a.assessment ? (a.assessment._id || a.assessment) : null,
        job: (a.assessment && a.assessment.job) ? (a.assessment.job._id || a.assessment.job) : null,
        assessmentTitle: a.assessment ? a.assessment.title : "Unknown",
        jobTitle: (a.assessment && a.assessment.job) ? a.assessment.job.title : "Unknown",
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        deadline,
        mcqScore: a.mcqScore,
        codeScore: a.codeScore,
        totalScore: a.totalScore,
        maxScore: a.maxScore,
        createdAt: a.createdAt,
      };
    });

    res.status(200).json({ success: true, count: formatted.length, attempts: formatted });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/attempts/assessment/:assessmentId ────────────────────────────────
// Recruiter lists attempts for their assessment. Paginated, with optional ?status=.
const assessmentAttempts = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(assessmentId)) {
      return res.status(400).json({ success: false, message: "Invalid assessment ID" });
    }

    const assessment = await Assessment.findById(assessmentId).populate("job", "postedBy");
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    // Recruiter must own the job
    if (!assessment.job.postedBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view attempts for this assessment",
      });
    }

    const { page, limit, skip } = parsePagination(req.query);

    const filter = { assessment: assessmentId };
    const VALID_STATUSES = ["in_progress", "submitted", "graded"];
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [attempts, total] = await Promise.all([
      Attempt.find(filter)
        .populate("candidate", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Attempt.countDocuments(filter),
    ]);

    const formatted = attempts.map((a) => {
      const deadline = new Date(new Date(a.startedAt).getTime() + assessment.durationMinutes * 60 * 1000);
      return {
        _id: a._id,
        candidate: a.candidate,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        deadline,
        mcqScore: a.mcqScore,
        codeScore: a.codeScore,
        totalScore: a.totalScore,
        maxScore: a.maxScore,
        gradedAt: a.gradedAt,
        createdAt: a.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      attempts: formatted,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/attempts/:id ─────────────────────────────────────────────────────
// Owning candidate OR recruiter who owns the job.
// Candidate response NEVER includes correctOption.
// Server-computed deadline is always returned.
const getAttemptById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid attempt ID" });
    }

    const attempt = await Attempt.findById(id)
      .populate({
        path: "assessment",
        populate: { path: "job", select: "postedBy title" },
      })
      .populate("candidate", "name email")
      .populate("gradedBy", "name role");

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    const isOwningCandidate = attempt.candidate._id.equals(req.user._id);
    const isOwningRecruiter = attempt.assessment.job.postedBy.equals(req.user._id);

    if (!isOwningCandidate && !isOwningRecruiter) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this attempt",
      });
    }

    const deadline = new Date(
      new Date(attempt.startedAt).getTime() + attempt.assessment.durationMinutes * 60 * 1000
    );

    if (isOwningCandidate) {
      return res.status(200).json({
        success: true,
        attempt: sanitizeAttemptForCandidate(attempt, attempt.assessment),
      });
    }

    // Recruiter view: full attempt details including assessment with correctOption
    const recruiterAttempt = attempt.toObject();
    recruiterAttempt.deadline = deadline;

    res.status(200).json({
      success: true,
      attempt: recruiterAttempt,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/attempts/:id/grade ─────────────────────────────────────────────
// Entire grade logic in this single function.
// Grades code questions only. Points cannot exceed question points.
const gradeAttempt = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid attempt ID" });
    }

    const attempt = await Attempt.findById(id).populate({
      path: "assessment",
      populate: { path: "job", select: "postedBy" },
    });

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    // Recruiter must own the job
    if (!attempt.assessment.job.postedBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to grade this attempt",
      });
    }

    // Attempt must be submitted or already graded (not in_progress)
    if (attempt.status === "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Cannot grade an attempt that is in progress",
      });
    }

    const { grades } = req.body;
    if (!Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({
        success: false,
        message: "grades must be a non-empty array",
      });
    }

    // Map questions from the assessment by string ID
    const qMap = new Map();
    for (const q of attempt.assessment.questions) {
      qMap.set(q._id.toString(), q);
    }

    const seenGradeQIds = new Set();

    for (let i = 0; i < grades.length; i++) {
      const g = grades[i];
      if (!g || !g.question) {
        return res.status(400).json({
          success: false,
          message: `grades[${i}]: question ID is required`,
        });
      }

      const qIdStr = g.question.toString();
      if (!mongoose.Types.ObjectId.isValid(qIdStr)) {
        return res.status(400).json({
          success: false,
          message: `grades[${i}]: Invalid question ID: ${qIdStr}`,
        });
      }

      // No duplicate grades
      if (seenGradeQIds.has(qIdStr)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate grade provided for question: ${qIdStr}`,
        });
      }
      seenGradeQIds.add(qIdStr);

      const q = qMap.get(qIdStr);
      if (!q) {
        return res.status(400).json({
          success: false,
          message: `Question ${qIdStr} does not belong to this assessment`,
        });
      }

      // Strictly reject any grade for MCQ questions
      if (q.type !== "code") {
        return res.status(400).json({
          success: false,
          message: `Cannot manually grade question ${qIdStr} because it is not a code question`,
        });
      }

      if (typeof g.pointsAwarded !== "number" || isNaN(g.pointsAwarded)) {
        return res.status(400).json({
          success: false,
          message: `pointsAwarded for question ${qIdStr} must be a number`,
        });
      }

      if (g.pointsAwarded < 0 || g.pointsAwarded > q.points) {
        return res.status(400).json({
          success: false,
          message: `pointsAwarded for question ${qIdStr} must be between 0 and maximum points (${q.points})`,
        });
      }

      // Apply grade to attempt answer
      let answerObj = attempt.answers.find((a) => a.question.equals(q._id));
      if (!answerObj) {
        // If candidate skipped this question in submission, add an answer entry
        answerObj = {
          question: q._id,
          codeAnswer: "",
          pointsAwarded: g.pointsAwarded,
          feedback: typeof g.feedback === "string" ? g.feedback.trim() : "",
        };
        attempt.answers.push(answerObj);
      } else {
        answerObj.pointsAwarded = g.pointsAwarded;
        if (typeof g.feedback === "string") {
          answerObj.feedback = g.feedback.trim();
        }
      }
    }

    // Recompute codeScore and totalScore on the server
    let codeScore = 0;
    for (const ans of attempt.answers) {
      const q = qMap.get(ans.question.toString());
      if (q && q.type === "code") {
        codeScore += ans.pointsAwarded || 0;
      }
    }

    attempt.codeScore = codeScore;
    attempt.totalScore = attempt.mcqScore + codeScore;
    attempt.status = "graded";
    attempt.gradedBy = req.user._id;
    attempt.gradedAt = new Date();

    await attempt.save();

    // Real-time notification: notify candidate of graded attempt
    notify(attempt.candidate, {
      type: "assessment_graded",
      title: "Assessment Graded",
      message: `Your assessment for ${attempt.assessment.title} has been graded: ${attempt.totalScore}/${attempt.maxScore} points`,
      data: { attempt: attempt._id, job: attempt.assessment.job._id || attempt.assessment.job },
    });

    res.status(200).json({
      success: true,
      attempt,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startAttempt,
  submitAttempt,
  myAttempts,
  assessmentAttempts,
  getAttemptById,
  gradeAttempt,
};
