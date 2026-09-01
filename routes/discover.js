const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");
const Block = require("../models/Block");
const Pass = require("../models/Pass");
const Like = require("../models/Like");
const Match = require("../models/Match");

router.use(requireAuth);

// 후보 쿼리: 나 + 차단/패스/이미 매칭된 상대 제외, 노출 허용(discoverable)된 유저만
router.get("/", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const [blocks, blockedBy, passes, likes, matches] = await Promise.all([
      Block.find({ owner: me }).select("targetId").lean(),
      Block.find({ targetId: me }).select("owner").lean(), // 나를 차단한 사람
      Pass.find({ owner: me }).select("targetId").lean(),
      Like.find({ owner: me }).select("targetId").lean(),
      Match.find({ users: me }).select("users").lean(),
    ]);

    const exclude = new Set([me]);
    blocks.forEach((b) => exclude.add(String(b.targetId)));
    blockedBy.forEach((b) => exclude.add(String(b.owner))); // 양방향 차단
    passes.forEach((p) => exclude.add(String(p.targetId)));
    likes.forEach((l) => exclude.add(String(l.targetId))); // 이미 좋아요한 사람은 다시 안 보이게
    matches.forEach((m) => m.users.forEach((u) => exclude.add(String(u))));

    // 내 위치/설정 → 거리 필터 (좌표를 실제로 설정한 경우에만 적용)
    const meDoc = await User.findById(me).select("location settings").lean();
    const coords = meDoc?.location?.coordinates;
    const hasGeo = Array.isArray(coords) && (Number(coords[0]) !== 0 || Number(coords[1]) !== 0);
    const maxKm = Math.max(1, Math.min(100, Number(meDoc?.settings?.maxDistance) || 10));

    const query = {
      _id: { $nin: [...exclude] },
      "photos.type": "owner_face",
      "settings.discoverable": { $ne: false }, // 기본(미설정)은 노출
    };
    if (hasGeo) {
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: coords },
          $maxDistance: maxKm * 1000, // km → m
        },
      };
    }

    const users = await User.find(query)
      .select("_id name photos pets settings verified birthYear about goal locationName location")
      .populate("pets", "name breed age type size temperament")
      .limit(limit)
      .lean();

    // 실제 거리(m) — 내 좌표와 상대 좌표가 모두 있을 때만
    const distM = (a, b) => {
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(b[1] - a[1]);
      const dLng = toRad(b[0] - a[0]);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
    };
    const theirCoords = (u) => {
      const c = u?.location?.coordinates;
      return Array.isArray(c) && (Number(c[0]) !== 0 || Number(c[1]) !== 0) ? c : null;
    };

    const year = new Date().getFullYear();
    const cards = users.map((u) => {
      const tc = hasGeo ? theirCoords(u) : null;
      const distanceM = tc ? distM(coords, tc) : undefined;
      const pet = Array.isArray(u.pets) && u.pets[0] ? u.pets[0] : null;
      const photos = (u.photos || []).filter((p) => ["owner_face", "pet"].includes(p.type));
      return {
        id: u._id,
        name: u.name || "Someone",
        verified: !!u.verified,
        distanceM,
        // person-first (dating)
        ownerAge: u.birthYear ? year - u.birthYear : undefined,
        about: u.about || "",
        goal: u.goal || "",
        location: u.locationName || "",
        facePhotos: photos.filter((p) => p.type === "owner_face").map((p) => p.url),
        petPhotos: photos.filter((p) => p.type === "pet").map((p) => p.url),
        pet: pet ? { name: pet.name, breed: pet.breed, age: pet.age, size: pet.size, temperament: pet.temperament || [] } : null,
        // legacy fields (kept for older clients)
        photos: photos.map((p) => ({ url: p.url, type: p.type })),
        age: pet?.age,
        breed: pet?.breed,
      };
    });

    res.json(cards);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
