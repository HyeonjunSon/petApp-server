const express = require("express");
const Match = require("../models/Match");
const Message = require("../models/Message");
const requireAuth = require("../middleware/requireAuth");
const { isValidObjectId, Types } = require("mongoose");
const router = express.Router();
const mongoose = require("mongoose");

// ✅ 모든 라우트에 인증 적용
router.use(requireAuth);

/** 1) 대화방 목록(채팅 상대 목록) */
/** 1) 대화방 목록(채팅 상대 목록) */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user._id;
    const uid = new mongoose.Types.ObjectId(userId); // ✅ ObjectId로 캐스팅

    const rooms = await Match.find({ users: uid }) // ✅ 여기서도 uid
      .select("_id users updatedAt lastMessage roomId")
      .populate({
        path: "users",
        select: "_id name",
        populate: { path: "ownedPets", select: "name" }, // ✅ 펫 이름만
      })
      .populate("lastMessage", "_id text createdAt from")
      .sort("-updatedAt")
      .lean({ virtuals: true });

    const matchIds = rooms.map((r) => r._id);

    // ✅ '상대가 보낸' + '내가 아직 안 읽은' 메시지 개수만 카운트
    const unreadAgg = await Message.aggregate([
      { $match: { match: { $in: matchIds } } },
      { $match: { from: { $ne: uid } } }, // ✅ uid로 비교
      { $match: { seenBy: { $ne: uid } } }, // ✅ 배열에 uid가 없어야 카운트
      { $group: { _id: "$match", count: { $sum: 1 } } },
    ]);

    const unreadMap = new Map(unreadAgg.map((x) => [String(x._id), x.count]));

    res.json(
      rooms.map((r) => ({
        ...r,
        unreadCount: unreadMap.get(String(r._id)) || 0,
      }))
    );
  } catch (e) {
    next(e);
  }
});

/** 2) 특정 방의 메시지 목록 (무한스크롤/이전 페이지네이션) */
router.get("/:id/messages", async (req, res, next) => {
  try {
    let { id } = req.params;
    let matchId = isValidObjectId(id) ? id : null;

    if (!matchId) {
      const m = await Match.findOne({ roomId: id }).select("_id");
      if (!m) return res.status(400).json({ message: "bad id" });
      matchId = m._id.toString();
    }

    const { before, limit = 30 } = req.query;
    const cond = { match: matchId };
    if (before) cond.createdAt = { $lt: new Date(before) };

    const docs = await Message.find(cond)
      .sort({ createdAt: -1 })
      .limit(Math.min(+limit, 100))
      .lean();

    res.json(docs.reverse());
  } catch (e) {
    next(e);
  }
});

/** 3) 특정 방의 '읽음' 처리 */
router.post("/:id/read", async (req, res, next) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user._id); // ✅ 캐스팅
    let { id } = req.params;

    let matchId = isValidObjectId(id) ? id : null;
    if (!matchId) {
      const m = await Match.findOne({ roomId: id }).select("_id");
      if (!m) return res.status(400).json({ message: "bad id" });
      matchId = String(m._id);
    }

    const matchDoc = await Match.findById(matchId).select("_id users");
    if (!matchDoc) return res.status(404).json({ message: "match not found" });
    if (!matchDoc.users.some((u) => String(u) === String(me))) {
      return res.status(403).json({ message: "forbidden" });
    }

    const { messageIds = [] } = req.body || {};
    const ids = messageIds.filter(isValidObjectId);
    if (ids.length === 0)
      return res.json({ ok: true, updated: 0, messageIds: [] });

    const result = await Message.updateMany(
      { _id: { $in: ids }, match: matchId, from: { $ne: me } }, // ✅ me는 ObjectId
      { $addToSet: { seenBy: me } } // ✅ seenBy에 me 추가
    );

    const io = req.app.get("io");
    io?.to(`match:${matchId}`).emit("message:read", {
      matchId: String(matchId),
      readerId: String(me),
      messageIds: ids.map(String),
    });

    // 남은 안읽음 수 계산(선택)
    const remaining = await Message.countDocuments({
      match: matchId,
      from: { $ne: me },
      seenBy: { $ne: me },
    });

    res.json({
      ok: true,
      updated: result.modifiedCount || 0,
      unreadLeft: remaining,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
