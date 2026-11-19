const mongoose = require("mongoose");

// Connect to MongoDB using the URI from .env
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1); // Exit process on failure — nothing else can run without DB
  }
};

module.exports = connectDB;
