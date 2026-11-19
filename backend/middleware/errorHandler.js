// Global error-handling middleware.
// Express identifies it as an error handler because it has 4 parameters (err, req, res, next).
// Any route that calls next(err) will land here.
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    // Show stack trace only in development to aid debugging
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
