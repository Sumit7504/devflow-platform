// 404 handler — catches any request that didn't match a registered route.
// Must be registered after all routes in server.js.
const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.originalUrl}`);
  err.statusCode = 404;
  next(err); // Forward to the global error handler
};

module.exports = notFound;
