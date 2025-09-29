// server/middleware/requireAuth.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 토큰에 어떤 키로 담겨도 잡히게
    const uid =
      payload.id ||
      payload._id ||
      payload.userId ||
      payload.uid ||
      (typeof payload.sub === "string" ? payload.sub : null);

    if (!uid) return res.status(401).json({ message: "Invalid token payload" });

    // ✅ 둘 다 세팅해서 호환성 유지
    req.userId = uid;
    req.user = { _id: uid };

    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
