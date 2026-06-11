// server/routes/account.js
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");

const User = require("../models/User");
const Pet = require("../models/Pet");
const Photo = require("../models/Photo");
const Walk = require("../models/Walks");
const Report = require("../models/Report");
const Block = require("../models/Block");
const Pass = require("../models/Pass");
const Match = require("../models/Match");
const Message = require("../models/Message");
const VerificationCode = require("../models/VerificationCode");
const WalkInvite = require("../models/WalkInvite");
const cloudinary = require("../cloudinary");

router.use(requireAuth);

// DELETE /api/account — 내 계정 + 관련 데이터 영구 삭제
router.delete("/", async (req, res, next) => {
  try {
    const uid = req.user._id;
    const user = await User.findById(uid).lean();
    if (!user) return res.status(404).json({ message: "User not found." });

    // 정리 대상 Cloudinary publicId 수집 (best-effort)
    const publicIds = new Set();
    (user.photos || []).forEach((p) => p.publicId && publicIds.add(p.publicId));
    const [pets, photos] = await Promise.all([
      Pet.find({ owner: uid }).select("photos").lean(),
      Photo.find({ owner: uid }).select("publicId").lean(),
    ]);
    pets.forEach((pet) => (pet.photos || []).forEach((p) => p.publicId && publicIds.add(p.publicId)));
    photos.forEach((ph) => ph.publicId && publicIds.add(ph.publicId));

    // 내가 속한 매치 + 메시지 삭제
    const myMatches = await Match.find({ users: uid }).select("_id").lean();
    const matchIds = myMatches.map((m) => m._id);

    await Promise.all([
      Pet.deleteMany({ owner: uid }),
      Photo.deleteMany({ owner: uid }),
      Walk.deleteMany({ owner: uid }),
      Report.deleteMany({ owner: uid }),
      Block.deleteMany({ owner: uid }),
      Pass.deleteMany({ owner: uid }),
      VerificationCode.deleteMany({ email: user.email }),
      Message.deleteMany({ match: { $in: matchIds } }),
      Match.deleteMany({ _id: { $in: matchIds } }),
      WalkInvite.deleteMany({ $or: [{ from: uid }, { to: uid }] }),
      User.deleteOne({ _id: uid }),
    ]);

    // Cloudinary는 실패해도 계정 삭제엔 영향 없음
    if (publicIds.size) {
      Promise.allSettled([...publicIds].map((pid) => cloudinary.uploader.destroy(pid)));
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
