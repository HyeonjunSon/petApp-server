// server/routes/photos.js
const express = require("express");
const multer = require("multer");
const requireAuth = require("../middleware/requireAuth");
const cloudinary = require("../cloudinary");
const Photo = require("../models/Photo");
const User = require("../models/User");

const router = express.Router();

/* ---------- 공통 ---------- */
const ALLOW_TYPES = new Set(["owner_face", "pet", "other"]);
const getUserId = (req) => req.userId || req.user?._id;

/* ---------- multer: 메모리 저장 ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(file.mimetype);
    cb(
      ok
        ? null
        : new multer.MulterError(
            "LIMIT_UNEXPECTED_FILE",
            "이미지 파일만 업로드할 수 있습니다."
          ),
      ok
    );
  },
});

/* ---------- Cloudinary 업로드 헬퍼 ---------- */
const uploadToCloudinary = (buffer, opts = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "petdate",
        resource_type: "image",
        transformation: [{ width: 1600, crop: "limit" }],
        ...opts,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/**
 * POST /api/photos
 * FormData: photo(파일), type=owner_face|pet|other
 */
router.post("/", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "photo 파일이 필요합니다." });

    const rawType = (req.body.type || "").trim();
    const type = ALLOW_TYPES.has(rawType) ? rawType : "other";
    const userId = getUserId(req);

    // Cloudinary 업로드
    const r = await uploadToCloudinary(req.file.buffer);
    const fileName =
      req.file.originalname ||
      r.original_filename ||
      new URL(r.secure_url).pathname.split("/").pop();

    // DB: Photo 문서 저장 (publicId 보관!)
    const photo = await Photo.create({
      owner: userId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: r.secure_url, // Cloudinary 공개 URL
      publicId: r.public_id, // 삭제/교체용
      type,
      fileName, 
    });

    // User.photos 반영 (필요시)
    await User.findByIdAndUpdate(
      userId,
      { $push: { photos: { url: photo.url, publicId: photo.publicId, type } } },
      { new: true }
    );

    return res.status(201).json({
      ok: true,
      photo: {
        _id: photo._id,
        url: photo.url,
        publicId: photo.publicId,
        type: photo.type,
      },
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
    .select("url publicId type createdAt")
    .lean();
  res.json(list);
});

/**
 * DELETE /api/photos/:id
 * 내 사진 삭제 (Cloudinary + DB)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await Photo.findOne({
      _id: req.params.id,
      owner: getUserId(req),
    });
    if (!doc)
      return res
        .status(404)
        .json({ message: "대상을 찾을 수 없거나 권한이 없습니다." });

    // Cloudinary에서 삭제
    if (doc.publicId) {
      try {
        await cloudinary.uploader.destroy(doc.publicId);
      } catch (_) {}
    }

    // User.photos에서도 제거
    await User.findByIdAndUpdate(
      getUserId(req),
      { $pull: { photos: { publicId: doc.publicId } } },
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
