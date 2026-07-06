// server/routes/steps.js
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const DailySteps = require("../models/DailySteps");

router.use(requireAuth);

const me = (req) => req.user._id;
const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* =================================================
   PUT /api/steps/today  body: { steps, source?, date? }
   Upsert today's (or specified date's) step count for the current user.
   Date defaults to server's local today; client should override with its
   own local YYYY-MM-DD for timezone correctness.
================================================= */
router.put("/today", async (req, res, next) => {
  try {
    const raw = Number(req.body?.steps);
    if (!Number.isFinite(raw) || raw < 0)
      return res.status(400).json({ message: "steps must be a non-negative number." });
    const steps = Math.floor(raw);

    const date = String(req.body?.date || todayISO()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ message: "date must be YYYY-MM-DD." });

    const sourceIn = String(req.body?.source || "").toLowerCase();
    const source = ["ios", "android", "manual"].includes(sourceIn) ? sourceIn : "manual";

    const doc = await DailySteps.findOneAndUpdate(
      { user: me(req), date },
      { $set: { steps, source } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(doc);
  } catch (e) {
    next(e);
  }
});

/* =================================================
   GET /api/steps?from=YYYY-MM-DD&to=YYYY-MM-DD
   Defaults: last 30 days through today.
================================================= */
router.get("/", async (req, res, next) => {
  try {
    const to = String(req.query.to || todayISO()).slice(0, 10);
    let from = String(req.query.from || "").slice(0, 10);
    if (!from) {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const list = await DailySteps.find({
      user: me(req),
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();

    res.json(list);
  } catch (e) {
    next(e);
  }
});

/* =================================================
   GET /api/steps/today
   Convenience: returns today's record (or null).
================================================= */
router.get("/today", async (req, res, next) => {
  try {
    const date = todayISO();
    const doc = await DailySteps.findOne({ user: me(req), date }).lean();
    res.json(doc || { date, steps: 0 });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
