// server/routes/settings.js
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");

router.use(requireAuth);

const DEFAULTS = {
  maxDistance: 10,
  ageRange: [20, 40],
  species: "all",
  discoverable: true,
  push: true,
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function sanitize(body = {}) {
  const out = {};
  if (body.maxDistance !== undefined) out.maxDistance = clamp(Number(body.maxDistance) || 1, 1, 100);
  if (Array.isArray(body.ageRange) && body.ageRange.length === 2) {
    let [a, b] = body.ageRange.map((x) => clamp(Number(x) || 0, 0, 80));
    if (a > b) [a, b] = [b, a];
    out.ageRange = [a, b];
  }
  if (["all", "dog", "cat"].includes(body.species)) out.species = body.species;
  if (typeof body.discoverable === "boolean") out.discoverable = body.discoverable;
  if (typeof body.push === "boolean") out.push = body.push;
  return out;
}

// GET /api/settings
router.get("/", async (req, res, next) => {
  try {
    const u = await User.findById(req.user._id).select("settings").lean();
    res.json({ ...DEFAULTS, ...(u?.settings || {}) });
  } catch (e) { next(e); }
});

// PUT /api/settings
router.put("/", async (req, res, next) => {
  try {
    const patch = sanitize(req.body);
    const set = {};
    for (const [k, v] of Object.entries(patch)) set[`settings.${k}`] = v;

    const u = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true })
      .select("settings")
      .lean();
    res.json({ ...DEFAULTS, ...(u?.settings || {}) });
  } catch (e) { next(e); }
});

module.exports = router;
