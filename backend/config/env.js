/**
 * Environment configuration validator.
 * Ensures all required environment variables are present before server initialization.
 * In production mode, validates secret strength to prevent deployment with placeholder secrets.
 */

/**
 * Environment configuration validator.
 * Ensures all required environment variables are present before server initialization.
 * In production mode, validates secret strength to prevent deployment with placeholder secrets.
 */

const validateEnv = () => {
  const required = ["MONGO_URI", "JWT_SECRET", "JWT_EXPIRES_IN", "CLIENT_URL"];
  const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());

  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  // Production-specific security checks
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.JWT_SECRET.trim();
    const disallowedPlaceholders = ["replace_with_", "changeme", "change_this"];

    if (secret.length < 32) {
      console.error("FATAL: In production, JWT_SECRET must be at least 32 characters long.");
      process.exit(1);
    }

    const hasPlaceholder = disallowedPlaceholders.some((ph) =>
      secret.toLowerCase().includes(ph)
    );

    if (hasPlaceholder) {
      console.error(
        "FATAL: In production, JWT_SECRET cannot contain placeholder values (replace_with_, changeme, change_this)."
      );
      process.exit(1);
    }

    if (process.env.DISABLE_RATE_LIMIT === "true") {
      console.error(
        "FATAL: In production, DISABLE_RATE_LIMIT cannot be set to true. Rate limiting is mandatory in production."
      );
      process.exit(1);
    }
  }
};

module.exports = validateEnv;
