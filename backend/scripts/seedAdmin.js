require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");

const seed = async () => {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  // Guard: both vars must be present
  if (!email || !password) {
    console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase().trim() });

  if (existing) {
    console.log(`Admin already exists (${email}), skipping.`);
  } else {
    await User.create({
      name:     "Admin",
      email:    email,
      password: password, // hashed automatically by the pre-save hook in User.js
      role:     "admin",
    });
    console.log(`Admin user created: ${email}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
  process.exit(0);
};

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
