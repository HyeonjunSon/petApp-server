// server/routes/walk-invites.js
const express = require("express");
const router = express.Router();
const { isValidObjectId } = require("mongoose");
const requireAuth = require("../middleware/requireAuth");
const Match = require("../models/Match");
const WalkInvite = require("../models/WalkInvite");
const { pushToUser } = require("../utils/push");

router.use(requireAuth);

const me = (req) => String(req.user._id);

/* =================================================
   POST /api/matches/:id/walk-invite
   body: { date, time, place?, note? }
================================================= */
router.post("/matches/:id/walk-invite", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid match id." });

    const match = await Match.findById(id).select("users").lean();
    if (!match) return res.status(404).json({ message: "Match not found." });
    if (!match.users.some((u) => String(u) === me(req)))
      return res.status(403).json({ message: "Not your match." });

    const peer = match.users.map(String).find((u) => u !== me(req));
    if (!peer) return res.status(400).json({ message: "Peer not found in match." });

    const { date, time, place, note } = req.body || {};
    if (!date || !time)
      return res.status(400).json({ message: "date and time are required." });

    const doc = await WalkInvite.create({
      from: me(req),
      to: peer,
      match: id,
      date: String(date),
      time: String(time),
      place: typeof place === "string" ? place.trim() : "",
      note: typeof note === "string" ? note.trim() : "",
      status: "proposed",
    });

    // 상대에게 산책 약속 알림
    pushToUser(peer, {
      title: "New walk invite 🚶",
      body: `A walk was proposed for ${doc.date} ${doc.time}.`,
      data: { type: "walk-invite", match: String(id) },
    });

    res.status(201).json(doc);
  } catch (e) { next(e); }
});

/* =================================================
   PATCH /api/walk-invites/:id
   body: { status: confirmed|declined|cancelled }
================================================= */
router.patch("/walk-invites/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid invite id." });

    const next_ = String(req.body?.status || "");
    if (!["confirmed", "declined", "cancelled"].includes(next_))
      return res.status(400).json({ message: "Invalid status." });

    const invite = await WalkInvite.findById(id);
    if (!invite) return res.status(404).json({ message: "Invite not found." });

    const myId = me(req);
    const isRecipient = String(invite.to) === myId;
    const isSender = String(invite.from) === myId;

    if (next_ === "confirmed" || next_ === "declined") {
      if (!isRecipient) return res.status(403).json({ message: "Only the recipient can accept or decline." });
    }
    if (next_ === "cancelled") {
      if (!isSender) return res.status(403).json({ message: "Only the sender can cancel." });
    }

    if (invite.status !== "proposed")
      return res.status(409).json({ message: "Invite is no longer pending." });

    invite.status = next_;
    await invite.save();
    res.json(invite);
  } catch (e) { next(e); }
});

/* =================================================
   GET /api/walk-invites
   query: scope=mine (default) | upcoming
================================================= */
router.get("/walk-invites", async (req, res, next) => {
  try {
    const myId = me(req);
    const scope = String(req.query.scope || "mine");
    const filter = { $or: [{ from: myId }, { to: myId }] };
    let query = WalkInvite.find(filter);
    if (scope === "upcoming") {
      query = WalkInvite.find({ ...filter, status: "confirmed" });
    }
    const list = await query.sort({ createdAt: -1 }).limit(50).lean();
    res.json(list);
  } catch (e) { next(e); }
});

module.exports = router;
