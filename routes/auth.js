// server/routes/auth.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const validator = require("validator");

const User = require("../models/User");
const VerificationCode = require("../models/VerificationCode");
const { sendMail, buildCodeEmail } = require("../config/mailer");

const SALT_ROUNDS = 10;
const CODE_TTL_MIN = 10;        // 코드 유효 10분
const VERIFIED_TTL_MIN = 30;    // 확인 후 회원가입까지 30분 유예
const MAX_ATTEMPTS = 5;

function issueToken(userId) {
  const payload = { sub: String(userId), id: String(userId) };
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

const normEmail = (e) =>
  typeof e === "string" ? e.trim().toLowerCase() : "";

const gen6 = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/* ---------------- 발송 남용 방지 ---------------- */
const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5, // IP당 10분에 5회
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests. Please try again later." },
});

/* ====================================================
   POST /api/auth/send-code  — 이메일 인증번호 발송 (회원가입용)
   body: { email }
==================================================== */
router.post("/send-code", sendLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    if (!validator.isEmail(email))
      return res.status(400).json({ msg: "Please enter a valid email." });

    const exists = await User.findOne({ email }).select("_id");
    if (exists) return res.status(409).json({ msg: "This email is already registered." });

    const code = gen6();
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

    await VerificationCode.findOneAndUpdate(
      { email, purpose: "verify_email" },
      { codeHash, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendMail({ to: email, ...buildCodeEmail({ code, purpose: "verify_email" }) });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ====================================================
   POST /api/auth/verify-code  — 인증번호 확인
   body: { email, code }
==================================================== */
router.post("/verify-code", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    if (!email || !code)
      return res.status(400).json({ msg: "email and code are required." });

    const doc = await VerificationCode.findOne({ email, purpose: "verify_email" });
    if (!doc || doc.expiresAt < new Date())
      return res.status(400).json({ msg: "The code has expired or does not exist." });

    if (doc.attempts >= MAX_ATTEMPTS)
      return res.status(429).json({ msg: "Too many attempts. Please request a new code." });

    const ok = await bcrypt.compare(code, doc.codeHash);
    if (!ok) {
      doc.attempts += 1;
      await doc.save();
      return res.status(400).json({ msg: "The code does not match." });
    }

    doc.verified = true;
    doc.expiresAt = new Date(Date.now() + VERIFIED_TTL_MIN * 60 * 1000);
    await doc.save();

    res.json({ ok: true, verified: true });
  } catch (e) { next(e); }
});

/* ====================================================
   POST /api/auth/register  — 회원가입 (이메일 인증 필수)
   body: { email, password, name }
==================================================== */
router.post("/register", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = req.body?.password;

    if (!email || !password || !name)
      return res.status(400).json({ msg: "email, password, name are required" });
    if (typeof password !== "string" || password.length < 6)
      return res.status(400).json({ msg: "Password must be at least 6 characters." });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ msg: "This email is already registered." });

    // 이메일 인증 확인
    const vc = await VerificationCode.findOne({ email, purpose: "verify_email" });
    if (!vc || !vc.verified || vc.expiresAt < new Date())
      return res.status(400).json({ msg: "Please verify your email first." });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email, passwordHash: hash, name, verified: true });

    await VerificationCode.deleteOne({ _id: vc._id });

    const token = issueToken(user._id);
    return res.status(201).json({
      token,
      user: { _id: user._id, email: user.email, name: user.name || "" },
    });
  } catch (err) { next(err); }
});

/* ====================================================
   POST /api/auth/login
==================================================== */
router.post("/login", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password)
      return res.status(400).json({ msg: "email & password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ msg: "invalid credentials" });

    const token = issueToken(user._id);
    return res.json({
      token,
      user: { _id: user._id, email: user.email, name: user.name || "" },
    });
  } catch (err) { next(err); }
});

/* ====================================================
   POST /api/auth/forgot-password  — 재설정 코드 발송
   body: { email }   (이메일 존재 여부와 무관하게 ok 응답)
==================================================== */
router.post("/forgot-password", sendLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    if (!validator.isEmail(email))
      return res.status(400).json({ msg: "Please enter a valid email." });

    const user = await User.findOne({ email }).select("_id");
    if (user) {
      const code = gen6();
      const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
      const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

      await VerificationCode.findOneAndUpdate(
        { email, purpose: "reset_password" },
        { codeHash, expiresAt, attempts: 0, verified: false },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await sendMail({ to: email, ...buildCodeEmail({ code, purpose: "reset_password" }) });
    }
    // 이메일 존재 노출 방지: 항상 ok
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ====================================================
   POST /api/auth/reset-password
   body: { email, code, newPassword }
==================================================== */
router.post("/reset-password", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const newPassword = req.body?.newPassword;

    if (!email || !code || !newPassword)
      return res.status(400).json({ msg: "email, code and newPassword are required." });
    if (typeof newPassword !== "string" || newPassword.length < 6)
      return res.status(400).json({ msg: "Password must be at least 6 characters." });

    const doc = await VerificationCode.findOne({ email, purpose: "reset_password" });
    if (!doc || doc.expiresAt < new Date())
      return res.status(400).json({ msg: "The code has expired or does not exist." });
    if (doc.attempts >= MAX_ATTEMPTS)
      return res.status(429).json({ msg: "Too many attempts. Please request a new code." });

    const ok = await bcrypt.compare(code, doc.codeHash);
    if (!ok) {
      doc.attempts += 1;
      await doc.save();
      return res.status(400).json({ msg: "The code does not match." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found." });

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    await VerificationCode.deleteOne({ _id: doc._id });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/logout", (_req, res) => res.json({ ok: true }));

/* ====================================================
   POST /auth/change-password
   Authenticated. Verifies the current password and sets a new one.
==================================================== */
const requireAuth = require("../middleware/requireAuth");
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({ msg: "currentPassword and newPassword are required." });
    if (typeof newPassword !== "string" || newPassword.length < 8)
      return res
        .status(400)
        .json({ msg: "Password must be at least 8 characters." });

    const user = await User.findById(req.userId).select("+passwordHash");
    if (!user) return res.status(404).json({ msg: "User not found." });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash || "");
    if (!ok)
      return res
        .status(400)
        .json({ msg: "Current password is incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
