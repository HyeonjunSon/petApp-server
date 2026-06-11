// server/routes/blocks.js
const express = require("express");
const router = express.Router();
const { isValidObjectId } = require("mongoose");
const requireAuth = require("../middleware/requireAuth");
const Block = require("../models/Block");

router.use(requireAuth);

const me = (req) => req.user._id;

// GET /api/blocks — 내 차단 목록
router.get("/", async (req, res, next) => {
  try {
    const list = await Block.find({ owner: me(req) }).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/blocks { targetId }
router.post("/", async (req, res, next) => {
  try {
    const targetId = String(req.body?.targetId || "").trim();
    if (!targetId) return res.status(400).json({ message: "targetId is required." });
    if (targetId === String(me(req)))
      return res.status(400).json({ message: "You cannot block yourself." });

    // 중복이면 기존 것 반환
    const doc = await Block.findOneAndUpdate(
      { owner: me(req), targetId },
      { $setOnInsert: { owner: me(req), targetId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// DELETE /api/blocks/:id — 차단 해제
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id format." });
    const deleted = await Block.findOneAndDelete({ _id: id, owner: me(req) });
    if (!deleted) return res.status(404).json({ message: "Target not found or permission denied." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
