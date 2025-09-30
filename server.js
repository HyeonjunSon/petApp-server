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

const connectDB = require("./config/db");

// REST 라우트
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const petRoutes = require("./routes/pets");
const matchRoutes = require("./routes/matches");
const walkRoutes = require("./routes/walks");
const photoRoutes = require("./routes/photos");
const reportsRouter = require("./routes/reports");
const discoverRoutes = require("./routes/discover");
const matchesLikeRoutes = require("./routes/matches-like");

// 채팅 모델
const Match = require("./models/Match");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

// ---------- 보안/공통 ----------
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false, // 정적 파일(CDN/이미지) 허용
    contentSecurityPolicy: false, // (프로덕션 전환 시 별도 CSP 구성 권장)
    crossOriginEmbedderPolicy: false,
  })
);

// ---------- CORS (여러 도메인 + 와일드카드 *.vercel.app 허용) ----------
const parseOrigins = (raw) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Heroku Config Vars: CORS_ORIGINS(권장) 또는 CORS_ORIGIN(레거시)
const ALLOW_LIST = parseOrigins(
  process.env.CORS_ORIGINS || process.env.CORS_ORIGIN
);

// 와일드카드 패턴 허용 검사 (예: https://pet-app-frontend-*.vercel.app)
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // ★ 서버-서버/모바일 앱/포스트맨 등 Origin 없는 요청 허용
  if (ALLOW_LIST.includes(origin)) return true; // 완전 일치
  // 와일드카드 패턴 매칭
  return ALLOW_LIST.some((pat) => {
    if (!pat.includes("*")) return false;
    const re = new RegExp(
      "^" + pat.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
    );
    return re.test(origin);
  });
};

// 디버그
console.log("[CORS] allow list =", ALLOW_LIST);

// ✅ 공용 옵션 객체 (이걸로 use/options 둘 다)
const corsOptions = {
  origin(origin, cb) {
    try {
      const ok = isAllowedOrigin(origin);
      cb(null, ok);
    } catch (e) {
      cb(e);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

const corsMw = cors(corsOptions);

app.use(corsMw);
// 모든 경로 프리플라이트 확실 응답(204)  ← ★ 여기서 undefined 참조 없도록 corsMw 사용
app.options(/.*/, corsMw);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ----- 정적 서빙 (업로드 이미지) -----
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), { maxAge: "7d" })
);

// ---------- HEALTH ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- REST 라우트 ----------
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pets", petRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/matches/likes", matchesLikeRoutes); // 경로 분리 유지
app.use("/api/walks", walkRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/reports", reportsRouter);

// ----- 로그아웃 경로 일관화 (/api 프리픽스) -----
app.post("/api/auth/logout", (req, res) => {
  if (req.session && typeof req.session.destroy === "function") {
    req.session.destroy(() => {
      if (typeof res.clearCookie === "function") res.clearCookie("sid");
      res.json({ ok: true });
    });
  } else {
    res.json({ ok: true });
  }
});

// ---------- Socket.IO ----------
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: (origin, cb) => cb(null, !!origin && isAllowedOrigin(origin)),
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
  },
});

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

      // 기존 match:* 룸 떠나고 새 룸 합류
      [...socket.rooms]
        .filter((r) => r.startsWith("match:"))
        .forEach((r) => socket.leave(r));
      socket.join(`match:${realId}`);
      socket.emit("joined", { matchId: realId });
    } catch (e) {
      console.error("join error:", e.message);
    }
  });

  socket.on("message", async ({ matchId, text, clientTempId, from }, ack) => {
    try {
      const realId = await normalizeMatchId(matchId);
      if (!realId || !text?.trim())
        return (
          typeof ack === "function" && ack({ ok: false, error: "bad payload" })
        );

      const senderId = userId || from;
      if (!senderId)
        return (
          typeof ack === "function" && ack({ ok: false, error: "unauthorized" })
        );

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

      if (typeof ack === "function")
        ack({ ok: true, serverId: payload._id, clientTempId });
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

// ---------- 에러 핸들러 ----------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ---------- 서버 시작 ----------
const PORT = process.env.PORT || 5050;
(async () => {
  try {
    await connectDB();
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
