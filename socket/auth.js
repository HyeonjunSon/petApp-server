// server/socket/auth.js
const jwt = require("jsonwebtoken");

module.exports = function socketAuth(io) {
  io.use((socket, next) => {
    const authHeader = socket.handshake.headers?.authorization || "";
    const headerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;
    const token = socket.handshake.auth?.token || headerToken;
    if (!token) return next(new Error("unauthorized"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // 다양한 JWT 필드 대응: _id | id | userId | sub
      const userId =
        payload?._id || payload?.id || payload?.userId || payload?.sub;
      if (!userId) return next(new Error("unauthorized"));
      socket.user = { _id: String(userId), name: payload?.name };
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });
};
