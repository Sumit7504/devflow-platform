const mongoose = require("mongoose");

// ── Slot subdocument schema ──────────────────────────────────────────────────
const slotSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end:   { type: Date, required: true },
  },
  { _id: true }
);

// ── Status history entry schema ──────────────────────────────────────────────
const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["proposed", "confirmed", "declined", "cancelled"],
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: true }
);

// ── Interview schema ─────────────────────────────────────────────────────────
// Note on Concurrency & Race Windows:
// Checking slot overlaps before executing an atomic status transition leaves a tiny
// theoretical window where two candidates confirming conflicting slots for the same
// recruiter at the exact same millisecond could both pass the read-check.
// In MongoDB, a partial unique index on application guarantees at most one active interview
// per application. For slot concurrency across distinct applications, the pre-check
// query plus atomic findOneAndUpdate provides high-integrity protection for web applications.
const interviewSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recruiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mode: {
      type: String,
      enum: ["online", "onsite", "phone"],
      required: true,
    },
    meetingLink: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    proposedSlots: {
      type: [slotSchema],
      validate: [
        { validator: (v) => v.length >= 1, message: "At least 1 slot is required" },
        { validator: (v) => v.length <= 5, message: "At most 5 slots are allowed" },
      ],
      required: true,
    },
    selectedSlot: {
      type: slotSchema,
      default: undefined,
    },
    status: {
      type: String,
      enum: ["proposed", "confirmed", "declined", "cancelled"],
      default: "proposed",
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Partial unique index: only ONE active interview ("proposed" or "confirmed") per application
interviewSchema.index(
  { application: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["proposed", "confirmed"] } },
  }
);

// Index to efficiently query confirmed slots for overlap detection
interviewSchema.index({ recruiter: 1, status: 1, "selectedSlot.start": 1, "selectedSlot.end": 1 });
interviewSchema.index({ candidate: 1, status: 1, "selectedSlot.start": 1, "selectedSlot.end": 1 });

module.exports = mongoose.model("Interview", interviewSchema);
