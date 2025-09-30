// server/routes/reports.js
const express = require("express");
const multer = require("multer");
const requireAuth = require("../middleware/requireAuth");
const cloudinary = require("../cloudinary");
const Report = require("../models/Report");

const router = express.Router();

/* ---------- multer: 메모리 저장 & 제한 ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    // 이미지/영상/오디오 허용
    const ok = /^(image|video|audio)\//.test(file.mimetype);
    cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", "이미지/영상/음성만 업로드 가능"), ok);
  },
});

/* ---------- Cloudinary 업로드 헬퍼 (auto) ---------- */
const uploadOne = (buffer) =>
  new Promise((resolve, reject) => {
    const s = cloudinary.uploader.upload_stream(
      { folder: "petdate/evidences", resource_type: "auto" },
      (err, r) => (err ? reject(err) : resolve(r.secure_url))
    );
    s.end(buffer);
  });

/**
 * POST /api/reports/evidences
 * form-data: evidences=<File>[] (최대 20개)
 * 응답: { urls: string[] }
 */
router.post("/evidences", requireAuth, upload.array("evidences", 20), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.json({ urls: [] });
    const urls = await Promise.all(req.files.map((f) => uploadOne(f.buffer)));
    return res.json({ urls });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "파일당 최대 25MB" });
      return res.status(400).json({ message: err.message || "업로드 실패" });
    }
    next(err);
  }
});

/**
 * POST /api/reports
 * body: { targetId, category, reason, evidenceUrls? }
 * 응답: 생성된 리포트
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { targetId, category, reason, evidenceUrls } = req.body || {};
    if (!targetId || !reason) return res.status(400).json({ message: "targetId, reason 필수" });

    const doc = await Report.create({
      owner: req.user?._id || req.userId,
      targetId: String(targetId),
      category: String(category || "기타"),
      reason: String(reason),
      evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 20) : [],
      status: "received",
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports?limit=20
 * 나의 신고 목록(최신순)
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const list = await Report.find({ owner: req.user?._id || req.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
