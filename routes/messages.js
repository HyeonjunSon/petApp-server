// server/routes/messages.js
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const Message = require("../models/Message");
const Match = require("../models/Match");

/**
 * GET /api/messages/unread
 * Returns the total count of incoming messages the current user hasn't seen.
 * Body shape: { count: number }
 */
router.get("/unread", requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const matches = await Match.find({ users: userId }).select("_id").lean();
    const matchIds = matches.map((m) => m._id);
    if (!matchIds.length) return res.json({ count: 0 });

    const count = await Message.countDocuments({
      match: { $in: matchIds },
      from: { $ne: userId },
      seenBy: { $ne: userId },
    });

    res.json({ count });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
