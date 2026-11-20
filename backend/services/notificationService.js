const Notification = require("../models/Notification");
const { getIO } = require("../socket");

/**
 * Persists a notification and emits a real-time event to the recipient's private room.
 * Failures never throw or interrupt the calling business operation.
 *
 * @param {string|mongoose.Types.ObjectId} recipientId - User ID of the recipient
 * @param {Object} options
 * @param {string} options.type - One of the valid NOTIFICATION_TYPES
 * @param {string} options.title - Short title
 * @param {string} options.message - Human-readable notification message
 * @param {Object} [options.data] - Linked entity references { application, job, interview, attempt }
 * @returns {Promise<Object|null>} The saved notification or null on failure
 */
const notify = async (recipientId, { type, title, message, data = {} }) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data,
    });

    try {
      const io = getIO();
      io.to(`user:${recipientId}`).emit("notification:new", notification);
    } catch (socketErr) {
      // Socket not initialized or emit issue; logged without failing
      console.error("Notification socket emit error:", socketErr.message);
    }

    return notification;
  } catch (err) {
    console.error("Notification service error:", err.message);
    return null;
  }
};

module.exports = {
  notify,
};
