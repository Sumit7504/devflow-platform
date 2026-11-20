const mongoose = require("mongoose");
const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Assessment = require("../models/Assessment");
const Attempt = require("../models/Attempt");
const Interview = require("../models/Interview");
const Company = require("../models/Company");

// Helper to escape regex special characters for safe substring queries
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── GET /api/admin/users ──────────────────────────────────────────────────────
const listUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.role) {
      filter.role = req.query.role;
    }

    if (req.query.isActive !== undefined) {
      if (req.query.isActive === "true") {
        filter.isActive = { $ne: false };
      } else if (req.query.isActive === "false") {
        filter.isActive = false;
      }
    }

    if (req.query.search && req.query.search.trim()) {
      const safe = escapeRegex(req.query.search.trim());
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      users,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
const getUserById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/admin/users/:id/status ─────────────────────────────────────────
const updateUserStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const { isActive } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // An admin cannot deactivate their own account
    if (req.user._id.equals(targetUser._id)) {
      return res.status(400).json({
        success: false,
        message: "Cannot deactivate your own account",
      });
    }

    // Last-admin guard: applies only when target is currently an active admin
    // Note: There is a small theoretical race window between counting active admins
    // and applying the status update if two active admins simultaneously attempt to deactivate each other.
    const isTargetActiveAdmin = targetUser.role === "admin" && targetUser.isActive !== false;
    if (isTargetActiveAdmin && isActive === false) {
      const activeAdminCount = await User.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot deactivate the last remaining active admin",
        });
      }
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    res.status(200).json({
      success: true,
      message: `User account ${isActive ? "activated" : "deactivated"} successfully`,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/admin/users/:id/role ───────────────────────────────────────────
const updateUserRole = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const { role } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // An admin cannot change their own role
    if (req.user._id.equals(targetUser._id)) {
      return res.status(400).json({
        success: false,
        message: "Cannot change your own role",
      });
    }

    // Last-admin guard: applies only when target is currently an active admin
    // Note: There is a small theoretical race window between counting active admins
    // and applying the role update if two active admins simultaneously demote each other.
    const isTargetActiveAdmin = targetUser.role === "admin" && targetUser.isActive !== false;
    if (isTargetActiveAdmin && role !== "admin") {
      const activeAdminCount = await User.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot change role of the last remaining admin",
        });
      }
    }

    targetUser.role = role;
    await targetUser.save();

    res.status(200).json({
      success: true,
      message: `User role updated to ${role} successfully`,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive !== false,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/jobs ───────────────────────────────────────────────────────
const listAllJobs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.search && req.query.search.trim()) {
      const safe = escapeRegex(req.query.search.trim());
      filter.title = { $regex: safe, $options: "i" };
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("company", "name website location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Job.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: jobs.length,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      jobs,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/admin/jobs/:id/close ───────────────────────────────────────────
const closeJobAdmin = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (job.status === "closed") {
      return res.status(400).json({ success: false, message: "Job is already closed" });
    }

    job.status = "closed";
    await job.save();

    res.status(200).json({
      success: true,
      message: "Job closed successfully",
      job,
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/jobs/:id ────────────────────────────────────────────────
const deleteJobAdmin = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // 1. Refuse if applications exist for this job
    const hasApplications = await Application.exists({ job: job._id });
    if (hasApplications) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete job with existing applications",
      });
    }

    // 2. Refuse if attempts exist for the job's assessment
    const assessment = await Assessment.findOne({ job: job._id });
    if (assessment) {
      const hasAttempts = await Attempt.exists({ assessment: assessment._id });
      if (hasAttempts) {
        return res.status(409).json({
          success: false,
          message: "Cannot delete job because assessment attempts exist",
        });
      }
    }

    // 3. Cascade delete assessment first, then delete job
    if (assessment) {
      await Assessment.findByIdAndDelete(assessment._id);
    }
    await Job.findByIdAndDelete(job._id);

    res.status(200).json({
      success: true,
      message: "Job and associated assessment deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
const getAdminStats = async (req, res, next) => {
  try {
    const baseUsersByRole = { candidate: 0, recruiter: 0, admin: 0 };
    const baseUsersByStatus = { active: 0, inactive: 0 };
    const baseJobsByStatus = { open: 0, closed: 0 };
    const baseApplicationsByStatus = { applied: 0, shortlisted: 0, rejected: 0, hired: 0 };
    const baseInterviewsByStatus = { proposed: 0, confirmed: 0, declined: 0, cancelled: 0 };
    const baseAttemptsByStatus = { in_progress: 0, submitted: 0, graded: 0 };

    const [
      userRoleAgg,
      userStatusAgg,
      totalUsers,
      jobStatusAgg,
      totalJobs,
      appStatusAgg,
      totalApplications,
      interviewStatusAgg,
      totalInterviews,
      attemptStatusAgg,
      totalAttempts,
      totalCompanies,
    ] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.aggregate([
        {
          $group: {
            _id: { $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"] },
            count: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments(),
      Job.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Job.countDocuments(),
      Application.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Application.countDocuments(),
      Interview.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Interview.countDocuments(),
      Attempt.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Attempt.countDocuments(),
      Company.countDocuments(),
    ]);

    const usersByRole = { ...baseUsersByRole };
    userRoleAgg.forEach((item) => {
      if (item._id && usersByRole[item._id] !== undefined) {
        usersByRole[item._id] = item.count;
      }
    });

    const usersByStatus = { ...baseUsersByStatus };
    userStatusAgg.forEach((item) => {
      if (item._id && usersByStatus[item._id] !== undefined) {
        usersByStatus[item._id] = item.count;
      }
    });

    const jobsByStatus = { ...baseJobsByStatus };
    jobStatusAgg.forEach((item) => {
      if (item._id && jobsByStatus[item._id] !== undefined) {
        jobsByStatus[item._id] = item.count;
      }
    });

    const applicationsByStatus = { ...baseApplicationsByStatus };
    appStatusAgg.forEach((item) => {
      if (item._id && applicationsByStatus[item._id] !== undefined) {
        applicationsByStatus[item._id] = item.count;
      }
    });

    const interviewsByStatus = { ...baseInterviewsByStatus };
    interviewStatusAgg.forEach((item) => {
      if (item._id && interviewsByStatus[item._id] !== undefined) {
        interviewsByStatus[item._id] = item.count;
      }
    });

    const attemptsByStatus = { ...baseAttemptsByStatus };
    attemptStatusAgg.forEach((item) => {
      if (item._id && attemptsByStatus[item._id] !== undefined) {
        attemptsByStatus[item._id] = item.count;
      }
    });

    res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          byRole: usersByRole,
          byStatus: usersByStatus,
        },
        jobs: {
          total: totalJobs,
          byStatus: jobsByStatus,
        },
        applications: {
          total: totalApplications,
          byStatus: applicationsByStatus,
        },
        interviews: {
          total: totalInterviews,
          byStatus: interviewsByStatus,
        },
        attempts: {
          total: totalAttempts,
          byStatus: attemptsByStatus,
        },
        companies: {
          total: totalCompanies,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  listAllJobs,
  closeJobAdmin,
  deleteJobAdmin,
  getAdminStats,
};
