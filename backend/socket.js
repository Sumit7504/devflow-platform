const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

let io = null;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true,
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

    // Clients cannot emit notification creation events.
    // The server is strictly the sole producer and publisher of notifications.
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

module.exports = {
  init,
  getIO,
};
