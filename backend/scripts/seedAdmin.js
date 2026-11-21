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

  // In production, reject weak or placeholder admin passwords
  if (process.env.NODE_ENV === "production") {
    const trimmed = password.trim();
    const disallowedPlaceholders = ["replace_with_", "changeme", "change_this", "admin"];

    if (trimmed.length < 12) {
      console.error("Error: In production, ADMIN_PASSWORD must be at least 12 characters long.");
      process.exit(1);
    }

    const hasPlaceholder = disallowedPlaceholders.some((ph) =>
      trimmed.toLowerCase().includes(ph)
    );

    if (hasPlaceholder) {
      console.error(
        "Error: In production, ADMIN_PASSWORD cannot contain placeholder or trivial values (replace_with_, changeme, change_this, admin)."
      );
      process.exit(1);
    }
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
