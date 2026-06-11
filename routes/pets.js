// server/routes/pets.js
const express = require("express");
const multer = require("multer");
const { isValidObjectId } = require("mongoose");

const requireAuth = require("../middleware/requireAuth");
const cloudinary = require("../cloudinary");
const Pet = require("../models/Pet");

const router = express.Router();
router.use(requireAuth);

/* ---------------- multer (메모리, 10MB, 이미지만) ---------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (matches users/me/photo)
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/.test(file.mimetype);
    cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Only image files are allowed."), ok);
  },
});

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const s = cloudinary.uploader.upload_stream(
      { folder: "petdate", resource_type: "image", transformation: [{ width: 1600, crop: "limit" }] },
      (err, r) => (err ? reject(err) : resolve(r))
    );
    s.end(buffer);
  });

/* ---------------- input normalization ---------------- */
const TYPES = Pet.TYPES;
const SEX = Pet.SEX;
const SIZE = Pet.SIZE;

function pickPetFields(body = {}) {
  const out = {};
  if (typeof body.name === "string") out.name = body.name.trim();

  // accept legacy `species` and map to canonical `type`
  const rawType = (body.type || body.species || "").toString().trim().toLowerCase();
  if (rawType) out.type = TYPES.includes(rawType) ? rawType : "other";

  if (typeof body.breed === "string") out.breed = body.breed.trim();

  if (body.age !== undefined && body.age !== null && body.age !== "") {
    const n = Number(body.age);
    if (!Number.isNaN(n)) out.age = Math.max(0, Math.min(60, n));
  }

  if (typeof body.sex === "string" && SEX.includes(body.sex)) out.sex = body.sex;
  if (typeof body.size === "string" && SIZE.includes(body.size)) out.size = body.size;

  if (Array.isArray(body.temperament)) {
    out.temperament = body.temperament
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => t.trim())
      .slice(0, 5);
  }

  // about / bio 동시 처리
  if (typeof body.about === "string") {
    out.about = body.about.trim();
    out.bio = out.about;
  } else if (typeof body.bio === "string") {
    out.bio = body.bio.trim();
    out.about = out.bio;
  }

  return out;
}

/* ---------------- 소유권 확인 헬퍼 ---------------- */
async function findOwnedPet(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid id format." });
    return null;
  }
  const pet = await Pet.findOne({ _id: id, owner: req.user._id });
  if (!pet) {
    res.status(404).json({ message: "Target not found or permission denied." });
    return null;
  }
  return pet;
}

/* =================================================
   [POST] /api/pets — 생성
================================================= */
router.post("/", async (req, res, next) => {
  try {
    const fields = pickPetFields(req.body);
    if (!fields.name) return res.status(400).json({ message: "name is required" });
    if (!fields.type) return res.status(400).json({ message: "type is required (dog|cat|other)" });

    const pet = await Pet.create({ owner: req.user._id, ...fields });
    res.status(201).json(pet);
  } catch (e) { next(e); }
});

/* =================================================
   [GET] /api/pets — 내 펫 목록
================================================= */
router.get("/", async (req, res, next) => {
  try {
    const list = await Pet.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(list);
  } catch (e) { next(e); }
});

/* =================================================
   [GET] /api/pets/:id — 단일 조회
================================================= */
router.get("/:id", async (req, res, next) => {
  try {
    const pet = await findOwnedPet(req, res);
    if (!pet) return;
    res.json(pet);
  } catch (e) { next(e); }
});

/* =================================================
   [PUT] /api/pets/:id — 부분 수정
================================================= */
router.put("/:id", async (req, res, next) => {
  try {
    const pet = await findOwnedPet(req, res);
    if (!pet) return;

    const fields = pickPetFields(req.body);
    Object.assign(pet, fields);
    await pet.save();
    res.json(pet);
  } catch (e) { next(e); }
});

/* =================================================
   [POST] /api/pets/:id/photo — 사진 추가 (Cloudinary)
   FormData: photo=<File>
================================================= */
router.post("/:id/photo", upload.single("photo"), async (req, res, next) => {
  try {
    const pet = await findOwnedPet(req, res);
    if (!pet) return;
    if (!req.file) return res.status(400).json({ message: "A photo file is required." });

    const r = await uploadToCloudinary(req.file.buffer);
    pet.photos.push({ url: r.secure_url, publicId: r.public_id });
    await pet.save();

    res.status(201).json({
      ok: true,
      photo: { url: r.secure_url, publicId: r.public_id },
      pet,
    });
  } catch (e) {
    if (e instanceof multer.MulterError) {
      if (e.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "File exceeds the 10MB limit" });
      return res.status(400).json({ message: e.message || "Upload failed" });
    }
    next(e);
  }
});

/* =================================================
   [DELETE] /api/pets/:id/photo/*publicId — 사진 개별 삭제
   - Express 5 splat: publicId는 슬래시(/) 포함 가능. 각 세그먼트는 디코딩되어 옴.
================================================= */
router.delete("/:id/photo/*publicId", async (req, res, next) => {
  try {
    const pet = await findOwnedPet(req, res);
    if (!pet) return;
    const raw = req.params.publicId;
    const publicId = Array.isArray(raw) ? raw.join("/") : String(raw);

    const before = pet.photos.length;
    pet.photos = pet.photos.filter((p) => p.publicId !== publicId);
    if (pet.photos.length === before) {
      return res.status(404).json({ message: "Photo not found." });
    }
    await pet.save();

    try { await cloudinary.uploader.destroy(publicId); } catch (_) { /* 최선노력 */ }
    res.json({ ok: true, pet });
  } catch (e) { next(e); }
});

/* =================================================
   [DELETE] /api/pets/:id — 펫 삭제 (+ Cloudinary 정리)
   - 🐛 fix: findByIdAndDelete({_id,owner}) → findOneAndDelete({_id,owner})
================================================= */
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id format." });

    const deleted = await Pet.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!deleted) return res.status(404).json({ message: "Target not found or permission denied." });

    // Cloudinary 정리는 최선노력
    const ids = (deleted.photos || []).map((p) => p.publicId).filter(Boolean);
    if (ids.length) {
      Promise.allSettled(ids.map((pid) => cloudinary.uploader.destroy(pid)));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
