const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one company per recruiter, enforced at DB level
    },
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    industry: {
      type: String,
      trim: true,
      default: "",
    },
    // Common headcount bands; empty string = not specified
    size: {
      type: String,
      enum: ["", "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
      default: "",
    },
    logo: {
      type: String, // plain URL string — no file upload
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
