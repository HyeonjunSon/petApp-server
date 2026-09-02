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
const { logSwipe } = require("../config/analytics");

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
      logSwipe({ actorId: me, targetId: you, action: "LIKE" });
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

    logSwipe({ actorId: me, targetId: you, action: "LIKE", matched: true, matchId: match._id });
    res.json({ ok: true, matched: true, matchId: match._id });
  } catch (e) { next(e); }
});

// GET /api/matches/likes-me — 나를 좋아요했지만 아직 매치 전인 이웃들.
// 프리미엄(see_likes)이면 전체 카드, 아니면 개수만 (잠금 응답).
router.get("/likes-me", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const Block = require("../models/Block");

    const [likesToMe, myLikes, matches, blocks, blockedBy] = await Promise.all([
      Like.find({ targetId: me }).select("owner createdAt").lean(),
      Like.find({ owner: me }).select("targetId").lean(),
      Match.find({ users: me }).select("users").lean(),
      Block.find({ owner: me }).select("targetId").lean(),
      Block.find({ targetId: me }).select("owner").lean(),
    ]);

    const exclude = new Set();
    myLikes.forEach((l) => exclude.add(String(l.targetId))); // 이미 상호 → 매치로 이동
    matches.forEach((m) => m.users.forEach((u) => exclude.add(String(u))));
    blocks.forEach((b) => exclude.add(String(b.targetId)));
    blockedBy.forEach((b) => exclude.add(String(b.owner)));

    const pending = likesToMe.filter((l) => !exclude.has(String(l.owner)));

    const unlocked = await Entitlement.hasFeature(me, "see_likes");
    if (!unlocked) {
      return res.json({ locked: true, count: pending.length });
    }

    const owners = await User.find({ _id: { $in: pending.map((l) => l.owner) } })
      .select("name photos pets")
      .populate("pets", "name breed photos")
      .lean();
    const byId = new Map(owners.map((u) => [String(u._id), u]));
    const users = pending
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((l) => {
        const u = byId.get(String(l.owner));
        if (!u) return null;
        const pet = Array.isArray(u.pets) ? u.pets[0] : null;
        const photo =
          pet?.photos?.[0]?.url ||
          (u.photos || []).find((p) => p.type === "pet")?.url ||
          (u.photos || []).find((p) => p.type === "owner_face")?.url;
        return {
          id: String(u._id),
          name: u.name || "Neighbour",
          petName: pet?.name,
          breed: pet?.breed,
          photo,
          likedAt: l.createdAt,
        };
      })
      .filter(Boolean);

    res.json({ locked: false, users });
  } catch (e) {
    next(e);
  }
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
    logSwipe({ actorId: me, targetId: you, action: "PASS" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
