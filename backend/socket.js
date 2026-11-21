const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const { getAllowedOrigins } = require("./config/cors");

let io = null;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no Origin header
        if (!origin) {
          return callback(null, true);
        }
        const normalized = origin.trim().replace(/\/+$/, "");
        const allowed = getAllowedOrigins();
        if (allowed.includes(normalized)) {
          return callback(null, true);
        }
        return callback(new Error("CORS policy: Not allowed by Socket.IO CORS"));
      },
      methods: ["GET", "POST"],
      credentials: false,
    },
  });

  // Authentication middleware: inspect socket.handshake.auth.token only
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error("Authentication error: User no longer exists"));
      }

      if (user.isActive === false) {
        return next(new Error("Authentication error: Account is deactivated"));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    // Automatically join the user's private room.
    // Clients can never choose or override which room to join.
    const userRoom = `user:${socket.user._id}`;
    socket.join(userRoom);

    socket.on("disconnect", () => {
      // Room departure handled automatically by socket.io upon disconnect
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized yet.");
  }
  return io;
};

const close = (callback) => {
  if (io) {
    io.close(callback);
  } else if (callback) {
    callback();
  }
};

module.exports = {
  init,
  getIO,
  close,
};
