// server/routes/photos.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const mimeTypes = require("mime-types"); // ← CJS 호환 (mime 말고 mime-types 사용)

const requireAuth = require("../middleware/requireAuth");
const Photo = require("../models/Photo");
const User = require("../models/User");

const router = express.Router();

// ---------- 업로드 디렉토리 보장 ----------
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- multer 설정 ----------
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext =
      mimeTypes.extension(file.mimetype) ||
      path.extname(file.originalname || "").slice(1) ||
      "bin";

    const base = path
      .parse(file.originalname || "upload")
      .name.replace(/[^\w\-가-힣_.]/g, "_");
    const uniq = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${uniq}.${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  // svg+xml 처리를 위해 + 대신 \+ 이스케이프
  if (/^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
  else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "이미지 파일만 업로드할 수 있습니다."));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---------- helper ----------
const ALLOW_TYPES = new Set(["owner_face", "pet", "other"]);
const toPublicUrl = (filename) => `/uploads/${filename}`;
const getUserId = (req) => req.userId || req.user?._id; // 미들웨어 구현 차이 호환

// ---------- 라우트 ----------

/**
 * POST /api/photos
 * FormData: photo(파일), type=owner_face|pet|other
 */
router.post("/", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "photo 파일이 필요합니다." });

    // type 검증 + 기본값
    const rawType = (req.body.type || "").trim();
    const type = ALLOW_TYPES.has(rawType) ? rawType : "other";

    const userId = getUserId(req);
    const { filename, mimetype, size, originalname } = req.file;
    const url = toPublicUrl(filename);

    // 1) Photo 저장
    const photo = await Photo.create({
      owner: userId,
      originalName: originalname,
      fileName: filename,
      mimeType: mimetype,
      size,
      url,
      type, // ✅ 저장
    });

    // 2) User.photos에도 반영 (프론트가 user.photos 사용 시)
    await User.findByIdAndUpdate(
      userId,
      { $push: { photos: { url, type } } },
      { new: true, upsert: false }
    ).lean();

    return res.status(201).json({
      ok: true,
      photo: { _id: photo._id, url: photo.url, type: photo.type },
    });
  } catch (e) {
    console.error("PHOTO UPLOAD ERROR:", e);
    if (e instanceof multer.MulterError) {
      if (e.code === "LIMIT_FILE_SIZE")
        return res.status(400).json({ message: "파일 용량(10MB) 초과" });
      return res.status(400).json({ message: e.message || "업로드 실패" });
    }
    return res.status(500).json({ message: "업로드 실패" });
  }
});

/**
 * GET /api/photos
 * 내 사진 목록 (최근순)
 */
router.get("/", requireAuth, async (req, res) => {
  const list = await Photo.find({ owner: getUserId(req) })
    .sort({ createdAt: -1 })
    .select("url type createdAt")
    .lean();
  res.json(list);
});

/**
 * DELETE /api/photos/:id
 * 내 사진 삭제
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await Photo.findOne({ _id: req.params.id, owner: getUserId(req) });
    if (!doc) return res.status(404).json({ message: "대상을 찾을 수 없거나 권한이 없습니다." });

    // 파일 삭제 (있을 때만)
    const filePath = path.join(UPLOAD_DIR, doc.fileName);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    // User.photos에서도 제거 (url 기준)
    await User.findByIdAndUpdate(
      getUserId(req),
      { $pull: { photos: { url: doc.url } } },
      { new: true }
    );

    await doc.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    console.error("PHOTO DELETE ERROR:", e);
    res.status(500).json({ message: "삭제 실패" });
  }
});

module.exports = router;
