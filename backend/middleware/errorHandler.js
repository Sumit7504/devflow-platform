/**
 * Global error-handling middleware.
 * Express identifies it as an error handler because it has 4 parameters (err, req, res, next).
 * Any route or middleware that calls next(err) will land here.
 */
const errorHandler = (err, req, res, next) => {
  // Catch body-parser entity too large (HTTP 413)
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      success: false,
      message: "Payload too large. Maximum size is 100kb.",
    });
  }

  // Catch body-parser malformed JSON syntax errors (HTTP 400)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON in request body.",
    });
  }

  const statusCode = err.statusCode || (err.status && typeof err.status === "number" ? err.status : 500);

  // In production, log internal 5xx errors on the server and sanitize the response message to avoid leaking internals.
  // 4xx errors (client mistakes, validation, unauthorized, not found) keep their clear descriptive message.
  if (statusCode >= 500) {
    console.error("Internal Server Error:", err);
    return res.status(statusCode).json({
      success: false,
      message: process.env.NODE_ENV === "production" ? "Internal Server Error" : (err.message || "Internal Server Error"),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }

  // 4xx responses: keep clear message
  res.status(statusCode).json({
    success: false,
    message: err.message || "Bad Request",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
