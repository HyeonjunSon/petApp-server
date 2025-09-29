// server/server.js
require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Server } = require("socket.io");
const { isValidObjectId } = require("mongoose");

const connectDB   = require("./config/db");

// REST 라우트
const authRoutes  = require("./routes/auth");
const userRoutes  = require("./routes/users");
const petRoutes   = require("./routes/pets");
const matchRoutes = require("./routes/matches");
const walkRoutes  = require("./routes/walks");
const photoRoutes = require("./routes/photos"); // ★ 추가
const discoverRoutes = require("./routes/discover");
const matchesLikeRoutes = require("./routes/matches-like");

// 채팅에 필요한 모델
const Match   = require("./models/Match");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

// ----- DB 연결 -----
connectDB();

// ----- 보안/공통 미들웨어 -----
app.use(
  helmet({
    crossOriginResourcePolicy: false,   // 정적 파일 서빙 편의
    contentSecurityPolicy: false,       // dev 간소화 (prod에서는 적절히 설정)
  })
);

// CORS: 필요에 맞춰 수정
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true, // 토큰/쿠키를 쓸 경우 true 권장
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// ----- 정적 서빙: 업로드 파일 공개 (/uploads/...) -----
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // ★ 추가

// ----- REST 라우트 -----
app.use("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pets",  petRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/walks", walkRoutes);
app.use("/api/photos", photoRoutes); // ★ 추가
app.use("/api/discover", discoverRoutes);
app.use("/api/matches", matchesLikeRoutes);

// ----- 로그아웃 (세션 사용 시) -----
app.post("/auth/logout", (req, res) => {
  req.session?.destroy?.(() => {
    res.clearCookie?.("sid");
    res.json({ ok: true });
  }) || res.json({ ok: true });
});

// ----- Socket.IO -----
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  },
});

// room-2 같은 문자열을 실제 Match ObjectId로 정규화
async function normalizeMatchId(id) {
  if (!id) return null;
  if (isValidObjectId(id)) return id;
  const m = await Match.findOne({ roomId: id }).select("_id");
  return m ? m._id.toString() : null;
}

io.on("connection", (socket) => {
  const userId = socket.user?._id?.toString?.();
  console.log("socket connected:", socket.id, userId ? `(user:${userId})` : "");

  if (userId) socket.join(`user:${userId}`);

  socket.on("join", async ({ matchId }) => {
    try {
      const realId = await normalizeMatchId(matchId);
      if (!realId) return;

      if (userId) {
        const ok = await Match.exists({ _id: realId, users: userId });
        if (!ok) return;
      }

      [...socket.rooms].filter((r) => r.startsWith("match:")).forEach((r) => socket.leave(r));
      socket.join(`match:${realId}`);
      socket.emit("joined", { matchId: realId });
    } catch (e) {
      console.error("join error:", e.message);
    }
  });

  socket.on("message", async ({ matchId, text, clientTempId, from }, ack) => {
    try {
      const realId = await normalizeMatchId(matchId);
      if (!realId || !text?.trim()) {
        if (typeof ack === "function") ack({ ok: false, error: "bad payload" });
        return;
      }

      const senderId = userId || from;
      if (!senderId) {
        if (typeof ack === "function") ack({ ok: false, error: "unauthorized" });
        return;
      }

      const msg = await Message.create({
        match: realId,
        from: senderId,
        text: text.trim(),
        readBy: [senderId],
      });

      await Match.findByIdAndUpdate(realId, { lastMessage: msg._id });

      const payload = {
        _id: msg._id.toString(),
        match: realId,
        from: senderId,
        text: msg.text,
        createdAt: msg.createdAt,
      };

      if (typeof ack === "function") {
        ack({ ok: true, serverId: payload._id, clientTempId });
      }

      io.to(`match:${realId}`).emit("message", payload);
    } catch (e) {
      console.error("message error:", e);
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  socket.on("typing", async ({ matchId, isTyping }) => {
    const realId = await normalizeMatchId(matchId);
    if (!realId) return;
    io.to(`match:${realId}`).emit("typing", { userId, isTyping: !!isTyping });
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});

// ----- 에러 핸들러 -----
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ----- 서버 시작 -----
const PORT = process.env.PORT || 5050;
(async () => {
  try {
    await connectDB(); // ✅ DB 연결을 기다림
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log("REST:   GET  /api/health");
      console.log("REST:   GET  /api/photos");
      console.log("Socket: ws   /socket.io");
    });
  } catch (err) {
    console.error("MongoDB connection error on boot:", err);
    process.exit(1);
  }
})();


module.exports = { app, server, io };
