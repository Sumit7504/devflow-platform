const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "application_received",
  "application_status",
  "assessment_submitted",
  "assessment_graded",
  "interview_proposed",
  "interview_confirmed",
  "interview_declined",
  "interview_cancelled",
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
    },
    data: {
      application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Application",
        default: undefined,
      },
      job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
        default: undefined,
      },
      interview: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Interview",
        default: undefined,
      },
      attempt: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attempt",
        default: undefined,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Query performance indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

// TTL index: automatically delete notifications after 90 days (90 * 24 * 60 * 60 seconds)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model("Notification", notificationSchema);
