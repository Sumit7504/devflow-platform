const mongoose = require("mongoose");

// ── Answer subdocument schema ────────────────────────────────────────────────
const answerSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    selectedOption: {
      type: Number,
      default: undefined,
    },
    codeAnswer: {
      type: String,
      maxlength: 10000,
      default: undefined,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

// ── Assessment Attempt schema ────────────────────────────────────────────────
// Note on abandoned attempts:
// If a candidate starts an attempt but closes their browser, disconnects, or fails
// to submit before the deadline expires, the attempt remains in status "in_progress".
// Time checks on submit reject any submission beyond the deadline (+grace period).
// A scheduled job or background query can later mark abandoned attempts (where
// startedAt + durationMinutes + grace < now) as "abandoned" or "expired" with zero score.
const attemptSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded"],
      default: "in_progress",
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    submittedAt: {
      type: Date,
    },
    answers: {
      type: [answerSchema],
      default: [],
    },
    mcqScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    codeScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    gradedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Enforce one attempt per candidate per assessment
attemptSchema.index({ assessment: 1, candidate: 1 }, { unique: true });

module.exports = mongoose.model("Attempt", attemptSchema);
