// server/routes/walk-invites.js
const express = require("express");
const router = express.Router();
const { isValidObjectId } = require("mongoose");
const requireAuth = require("../middleware/requireAuth");
const Match = require("../models/Match");
const WalkInvite = require("../models/WalkInvite");
const Walk = require("../models/Walks");
const Pet = require("../models/Pet");
const { pushToUser } = require("../utils/push");
const { logWalkEvent } = require("../config/analytics");

// Build a Date from the invite's "YYYY-MM-DD" + "HH:mm".
function parseInviteStart(invite) {
  const t = /^\d{2}:\d{2}$/.test(invite.time || "") ? invite.time : "12:00";
  const d = new Date(`${invite.date}T${t}:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}

// NB: mounted at /api so we MUST attach requireAuth per-route, not via
// router.use — otherwise public routes like /api/billing/plans get a 401
// from this router before reaching their own handler.

const me = (req) => String(req.user._id);

/* =================================================
   POST /api/matches/:id/walk-invite
   body: { date, time, place?, note? }
================================================= */
router.post("/matches/:id/walk-invite", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid match id." });

    const match = await Match.findById(id).select("users").lean();
    if (!match) return res.status(404).json({ message: "Match not found." });
    if (!match.users.some((u) => String(u) === me(req)))
      return res.status(403).json({ message: "Not your match." });

    const peer = match.users.map(String).find((u) => u !== me(req));
    if (!peer) return res.status(400).json({ message: "Peer not found in match." });

    const { date, time, place, note, location } = req.body || {};
    if (!date || !time)
      return res.status(400).json({ message: "date and time are required." });

    // 선택: 만날 장소 좌표 { lat, lng }
    let meetPoint;
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      meetPoint = { type: "Point", coordinates: [lng, lat] };
    }

    const doc = await WalkInvite.create({
      from: me(req),
      to: peer,
      match: id,
      date: String(date),
      time: String(time),
      place: typeof place === "string" ? place.trim() : "",
      ...(meetPoint ? { meetPoint } : {}),
      note: typeof note === "string" ? note.trim() : "",
      status: "proposed",
    });

    logWalkEvent({ inviteId: doc._id, matchId: id, actorId: me(req), status: "PROPOSED" });

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
router.patch("/walk-invites/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid invite id." });

    const next_ = String(req.body?.status || "");
    if (!["confirmed", "declined", "cancelled", "completed"].includes(next_))
      return res.status(400).json({ message: "Invalid status." });

    const invite = await WalkInvite.findById(id);
    if (!invite) return res.status(404).json({ message: "Invite not found." });

    const myId = me(req);
    const isRecipient = String(invite.to) === myId;
    const isSender = String(invite.from) === myId;
    if (!isRecipient && !isSender)
      return res.status(403).json({ message: "Not your invite." });

    // completed: a confirmed walk actually happened → auto-create a Walk
    // record for each participant that has a pet (records are never entered
    // by hand — they flow from completing a plan).
    if (next_ === "completed") {
      if (invite.status !== "confirmed")
        return res.status(409).json({ message: "Only confirmed walks can be completed." });

      const startedAt = parseInviteStart(invite);
      const walkIds = [];
      for (const uid of [String(invite.from), String(invite.to)]) {
        const pet = await Pet.findOne({ owner: uid }).select("_id").lean();
        if (!pet) continue;
        const w = await Walk.create({
          owner: uid,
          pet: pet._id,
          distanceKm: Math.max(0, Number(invite.distanceKm) || 0),
          durationMin: Math.max(0, Number(invite.durationMin) || 0),
          startedAt,
          endedAt: startedAt,
          notes: invite.place || invite.note || "",
        });
        walkIds.push(w._id);
      }
      invite.status = "completed";
      invite.completedAt = new Date();
      invite.linkedWalks = walkIds;
      await invite.save();
      logWalkEvent({ inviteId: invite._id, matchId: invite.match, actorId: myId, status: "COMPLETED" });
      return res.json(invite);
    }

    // proposed → confirmed/declined/cancelled
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
    logWalkEvent({
      inviteId: invite._id,
      matchId: invite.match,
      actorId: myId,
      status: next_.toUpperCase(),
    });
    res.json(invite);
  } catch (e) { next(e); }
});

/* =================================================
   GET /api/walk-invites
   query: scope=mine (default) | upcoming
================================================= */
router.get("/walk-invites", requireAuth, async (req, res, next) => {
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
