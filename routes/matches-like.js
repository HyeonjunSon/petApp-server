// server/routes/matches-like.js
// 마운트: app.use("/api/matches", matchesLikeRoutes)  → /api/matches/like/:id, /api/matches/pass/:id
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const Match = require("../models/Match");
const Pass = require("../models/Pass");
const Like = require("../models/Like");
const User = require("../models/User");
const Entitlement = require("../models/Entitlement");
const { pushToUser } = require("../utils/push");

const FREE_DAILY_LIKE_LIMIT = 30;

router.use(requireAuth);

// POST /api/matches/like/:targetId — 상호 좋아요일 때만 매치 생성
router.post("/like/:targetId", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const you = String(req.params.targetId);
    if (me === you) return res.status(400).json({ message: "self like not allowed" });

    // Daily swipe gate: free users get FREE_DAILY_LIKE_LIMIT/day; entitlement
    // "unlimited_swipes" bypasses. Counts likes created today (UTC midnight).
    const hasUnlimited = await Entitlement.hasFeature(me, "unlimited_swipes");
    if (!hasUnlimited) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const used = await Like.countDocuments({
        owner: me,
        createdAt: { $gte: startOfDay },
      });
      if (used >= FREE_DAILY_LIKE_LIMIT) {
        return res.status(402).json({
          feature: "unlimited_swipes",
          msg: `Daily like limit (${FREE_DAILY_LIKE_LIMIT}) reached. Upgrade for unlimited swipes.`,
        });
      }
    }

    // 패스했던 기록이 있으면 해제(다시 관심)
    await Pass.deleteOne({ owner: me, targetId: you }).catch(() => {});

    // 내 좋아요 기록 (중복 방지)
    await Like.findOneAndUpdate(
      { owner: me, targetId: you },
      { $setOnInsert: { owner: me, targetId: you } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 상대가 나를 이미 좋아했는지 확인 → 상호일 때만 매치
    const reciprocal = await Like.findOne({ owner: you, targetId: me }).select("_id").lean();
    if (!reciprocal) {
      return res.json({ ok: true, matched: false });
    }

    const users = [me, you].sort();
    let match = await Match.findOne({ users });
    if (!match) match = await Match.create({ users });

    // 상대(먼저 좋아요한 사람)에게 매치 알림
    const meDoc = await User.findById(me).select("name").lean();
    pushToUser(you, {
      title: "It's a Match! 🐾",
      body: `${meDoc?.name || "Someone"} liked you back.`,
      data: { type: "match", matchId: String(match._id) },
    });

    res.json({ ok: true, matched: true, matchId: match._id });
  } catch (e) { next(e); }
});

// POST /api/matches/pass/:targetId — 패스 기록 (discover에서 제외)
router.post("/pass/:targetId", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const you = String(req.params.targetId);
    if (me === you) return res.status(400).json({ message: "self pass not allowed" });

    await Pass.findOneAndUpdate(
      { owner: me, targetId: you },
      { $setOnInsert: { owner: me, targetId: you } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
