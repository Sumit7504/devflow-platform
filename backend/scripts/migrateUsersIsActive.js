require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

// One-time migration script: sets isActive: true for any existing users that lack it
const migrate = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB for isActive migration...");

    const result = await User.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} user(s).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
};

migrate();
