// server/routes/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // bcryptjs 써도 됨. 프로젝트 전반에서 하나로 통일!
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");

const SALT_ROUNDS = 10;

/* ---------------- Cloudinary 업로드 준비 ---------------- */
const multer = require("multer");
const cloudinary = require("../cloudinary"); // server/cloudinary.js (cloud_name, api_key, api_secret 설정)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp)/.test(file.mimetype);
    cb(ok ? null : new Error("이미지 파일만 업로드 가능합니다."), ok);
  },
});
/* ------------------------------------------------------ */

// req.user 혹은 req.userId 어떤 미들웨어든 대응
function getUserId(req) {
  // req.user가 객체면 _id 사용, 아니면 req.userId 사용
  return (req.user && (req.user._id || req.user.id)) || req.userId;
}

/**
 * 회원가입
 * POST /api/users/register
 */
router.post("/register", async (req, res, next) => {
  try {
    let { email, password, name, phone, birthYear } = req.body || {};

    // 정규화
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    name = typeof name === "string" ? name.trim() : "";

    if (!email || !password || !name) {
      return res.status(400).json({ message: "email, password, name 필수" });
    }

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: "이미 사용중인 이메일" });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email,
      passwordHash,
      name,
      phone: phone ?? "",
      birthYear: birthYear ?? null,
    });

    const token = jwt.sign(
      { sub: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name || "",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 로그인
 * POST /api/users/login
 */
router.post("/login", async (req, res, next) => {
  try {
    let { email, password } = req.body || {};
    email = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!email || !password) {
      return res.status(400).json({ message: "email & password required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "잘못된 계정" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "잘못된 계정" });

    const token = jwt.sign(
      { sub: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name || "",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 로그아웃 (클라이언트 토큰 삭제와 호환)
 * POST /api/users/logout
 * - 서버에서 유지하는 세션이 없다면 OK만 반환
 */
router.post("/logout", (_req, res) => {
  return res.json({ ok: true });
});

/**
 * 내 프로필 수정 (소수 필드)
 * PATCH /api/users/update
 */
router.patch("/update", requireAuth, async (req, res, next) => {
  try {
    const allowed = ["name", "phone", "about", "birthYear"];
    const updateFields = {};

    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        updateFields[f] =
          f === "name" && typeof req.body[f] === "string"
            ? req.body[f].trim()
            : req.body[f];
      }
    }

    const updated = await User.findByIdAndUpdate(getUserId(req), updateFields, {
      new: true,
    }).lean();

    if (!updated) return res.status(404).json({ message: "사용자 없음" });

    return res.json({
      _id: updated._id,
      email: updated.email,
      name: updated.name || "",
      phone: updated.phone || "",
      birthYear: updated.birthYear ?? null,
      about: updated.about || "",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 비밀번호 변경
 * POST /api/users/change-password
 */
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword & newPassword required" });
    }

    const user = await User.findById(getUserId(req));
    if (!user) return res.status(404).json({ message: "사용자 없음" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid)
      return res
        .status(401)
        .json({ message: "현재 비밀번호가 올바르지 않습니다." });

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * 내 정보 조회
 * GET /api/users/me
 */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const me = await User.findById(getUserId(req)).lean();
    if (!me) return res.status(404).json({ message: "User not found" });
    res.json(me);
  } catch (err) {
    next(err);
  }
});

/**
 * 내 프로필 수정 (확장)
 * PUT /api/users/me
 */
router.put("/me", requireAuth, async (req, res, next) => {
  try {
    const { name, about, goal, interests, phone, birthYear } = req.body;

    const update = {};
    if (typeof name === "string") update.name = name.trim();
    if (typeof about === "string") update.about = about;
    if (typeof goal === "string") update.goal = goal;
    if (Array.isArray(interests)) update.interests = interests.slice(0, 5);
    if (typeof phone === "string") update.phone = phone.trim();
    if (birthYear !== undefined) update.birthYear = birthYear;

    const me = await User.findByIdAndUpdate(
      getUserId(req),
      { $set: update },
      { new: true }
    ).lean();

    if (!me) return res.status(404).json({ message: "User not found" });
    res.json(me);
  } catch (err) {
    next(err);
  }
});

/* ====================== Cloudinary 업로드/삭제 ====================== */
/**
 * 사진 업로드 (Cloudinary)
 * POST /api/users/me/photo
 * form-data: photo=<File>, type=owner_face|pet (optional, default "pet")
 */
router.post(
  "/me/photo",
  requireAuth,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일 없음" });

      const { type = "pet" } = req.body;

      // Cloudinary 업로드 (메모리 버퍼 사용)
      const streamUpload = () =>
        new Promise((resolve, reject) => {
          const s = cloudinary.uploader.upload_stream(
            {
              folder: "petdate",
              resource_type: "image",
              transformation: [{ width: 1600, crop: "limit" }], // 과대 이미지 제한
            },
            (err, result) => (err ? reject(err) : resolve(result))
          );
          s.end(req.file.buffer);
        });

      const r = await streamUpload(); // { secure_url, public_id, ... }
      const uid = getUserId(req);

      // DB에 추가
      const me = await User.findById(uid);
      if (!me) return res.status(404).json({ message: "User not found" });

      me.photos = me.photos || [];
      me.photos.push({
        url: r.secure_url,
        publicId: r.public_id,
        type,
      });
      await me.save();

      return res.json({ url: r.secure_url, publicId: r.public_id, type });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 사진 삭제 (Cloudinary + DB)
 * DELETE /api/users/me/photo/:publicId
 */
router.delete("/me/photo/:publicId", requireAuth, async (req, res, next) => {
  try {
    const { publicId } = req.params;

    // Cloudinary에서 삭제
    await cloudinary.uploader.destroy(publicId);

    // DB에서 제거
    await User.updateOne(
      { _id: getUserId(req) },
      { $pull: { photos: { publicId } } }
    );

    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});
/* ================================================================== */

module.exports = router;
