// server/socket/auth.js
const jwt = require("jsonwebtoken");

module.exports = function socketAuth(io) {
  io.use((socket, next) => {
    // 방법 A: query.token / 방법 B: cookie / 방법 C: 헤더
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) return next(new Error("unauthorized"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { _id: payload._id, name: payload.name };
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });
};
