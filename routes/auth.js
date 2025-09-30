// server/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const SALT_ROUNDS = 10;

function issueToken(userId) {
  // requireAuth가 sub 또는 id 어느 쪽을 기대해도 안전하게 동작하도록 둘 다 넣음
  const payload = { sub: String(userId), id: String(userId) };
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

/**
 * POST /api/auth/register
 */
router.post("/register", async (req, res, next) => {
  try {
    let { email, password, name } = req.body || {};
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    name = typeof name === "string" ? name.trim() : "";

    if (!email || !password || !name) {
      return res.status(400).json({ msg: "email, password, name are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ msg: "email already in use" });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email, passwordHash: hash, name });

    const token = issueToken(user._id);
    return res.status(201).json({
      token,
      user: { _id: user._id, email: user.email, name: user.name || "" },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res, next) => {
  try {
    let { email, password } = req.body || {};
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!email || !password) {
      return res.status(400).json({ msg: "email & password required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ msg: "invalid credentials" });

    const token = issueToken(user._id);
    return res.json({
      token,
      user: { _id: user._id, email: user.email, name: user.name || "" },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => res.json({ ok: true }));

module.exports = router;
