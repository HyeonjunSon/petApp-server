const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");

router.use(requireAuth);

// 매우 단순한 후보 쿼리: 나를 제외하고 대표사진이 있는 유저
router.get("/", async (req, res, next) => {
  try {
    const me = req.userId;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const users = await User.find({
      _id: { $ne: me },
      "photos.type": "owner_face",
    })
      .select("_id name photos pets")
      .limit(limit)
      .lean();

    const cards = users.map((u) => ({
      id: u._id,
      name: u.name || "이름 없음",
      photos: (u.photos || [])
        .filter((p) => ["owner_face", "pet"].includes(p.type)) // ✅ 얼굴+펫
        .map((p) => ({ url: p.url, type: p.type })), // type 유지
      age: u.pets?.[0]?.age,
      breed: u.pets?.[0]?.breed,
    }));

    res.json(cards);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
