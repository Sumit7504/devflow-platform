const mongoose = require("mongoose");

// ── Question subdocument ──────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema(
  {
    type:          { type: String, enum: ["mcq", "code"], required: true },
    text:          { type: String, required: true, trim: true },
    points:        { type: Number, required: true, min: 1 },
    // options: present only for mcq (2–6 strings). undefined for code questions.
    options:       { type: [String], default: undefined },
    // correctOption: index into options. Present only for mcq.
    correctOption: { type: Number, default: undefined },
  },
  { _id: true } // keep subdocument _id
);

// ── Assessment schema ─────────────────────────────────────────────────────────
const assessmentSchema = new mongoose.Schema(
  {
    job: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Job",
      required: true,
      unique:   true, // one assessment per job, enforced at DB level
    },
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    title: {
      type:     String,
      required: [true, "Assessment title is required"],
      trim:     true,
    },
    description: {
      type:    String,
      trim:    true,
      default: "",
    },
    durationMinutes: {
      type:     Number,
      required: [true, "durationMinutes is required"],
      min:      [1,   "durationMinutes must be at least 1"],
      max:      [180, "durationMinutes must be at most 180"],
    },
    questions: {
      type:     [questionSchema],
      validate: [
        { validator: (v) => v.length >= 1,  message: "At least 1 question is required" },
        { validator: (v) => v.length <= 50, message: "At most 50 questions are allowed" },
      ],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assessment", assessmentSchema);
