const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const Match = require("../models/Match");

router.use(requireAuth);

// MVP: 바로 매치 생성 (중복 방지)
router.post("/like/:targetId", async (req, res, next) => {
  try {
    const me = req.userId;
    const you = req.params.targetId;

    if (me === you) return res.status(400).json({ message: "self like not allowed" });

    const users = [me, you].sort(); // 배열 정렬로 중복 방지
    let match = await Match.findOne({ users });
    if (!match) match = await Match.create({ users });

    res.json({ ok: true, matchId: match._id });
  } catch (e) { next(e); }
});

module.exports = router;
