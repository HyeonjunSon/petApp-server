// server/server.js
require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
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

const { initSocket } = require("./socket");

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

const io = initSocket(
  server,
  // CORS 검사: 기존 isAllowedOrigin 재사용
  (origin, cb) => {
    try { cb(null, isAllowedOrigin(origin)); }
    catch (e) { cb(e); }
  }
);

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
      console.log("Socket.IO ready on /socket.io");
    });
  } catch (err) {
    console.error("MongoDB connection error on boot:", err);
    process.exit(1);
  }
})();

module.exports = { app, server, io };
