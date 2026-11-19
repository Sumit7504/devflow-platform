const mongoose = require("mongoose");

const STATUS_ENUM = ["applied", "shortlisted", "rejected", "hired"];

const applicationSchema = new mongoose.Schema(
  {
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
    coverLetter: {
      type: String,
      trim: true,
      default: "",
    },
    resumeUrl: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "applied",
    },
    // Every status change is appended here for a full audit trail
    statusHistory: [
      {
        status:    { type: String, enum: STATUS_ENUM },
        changedAt: { type: Date,   default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  { timestamps: true }
);

// One application per candidate per job — enforced at the DB level
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
