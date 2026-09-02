// server/routes/billing.js
//
// Billing — subscription lifecycle. Two modes:
//   · Stripe mode (STRIPE_SECRET_KEY set): checkout/portal/webhook — still TODO.
//   · Demo mode (default): checkout instantly activates the subscription and
//     grants the plan's entitlements, cancel flips cancelAtPeriodEnd and caps
//     entitlements at the period end. The data layer (Plan/Subscription/
//     Entitlement) is identical, so wiring Stripe later only swaps the edges.

const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");

const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const Entitlement = require("../models/Entitlement");

const STRIPE_READY = !!process.env.STRIPE_SECRET_KEY;

const DEFAULT_PLANS = [
  {
    code: "premium_monthly",
    label: "Offleash Premium",
    description: "Unlimited swipes, see who liked you, premium badge.",
    priceCents: 990000, // ₩9,900 (KRW has no minor unit; stored *100 for display consistency)
    currency: "KRW",
    interval: "month",
    features: ["unlimited_swipes", "see_likes"],
    sortOrder: 0,
  },
  {
    code: "premium_yearly",
    label: "Offleash Premium (yearly)",
    description: "Two months free on the yearly plan.",
    priceCents: 9900000, // ₩99,000
    currency: "KRW",
    interval: "year",
    features: ["unlimited_swipes", "see_likes"],
    sortOrder: 1,
  },
];

/** 카탈로그가 비어 있으면 기본 플랜을 만들어 둔다 (데모/신규 환경 부트스트랩). */
async function ensurePlans() {
  const count = await Plan.countDocuments({ active: true });
  if (count > 0) return;
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ code: p.code }, { $setOnInsert: { ...p, active: true } }, { upsert: true });
  }
}

/* ------------------------------------------------------------------
   GET /api/billing/plans — public catalog.
------------------------------------------------------------------ */
router.get("/plans", async (_req, res, next) => {
  try {
    await ensurePlans();
    const plans = await Plan.find({ active: true })
      .sort({ sortOrder: 1, priceCents: 1 })
      .lean();
    res.json(plans);
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   GET /api/billing/me — subscription + entitlements snapshot.
------------------------------------------------------------------ */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const [sub, entitlements] = await Promise.all([
      Subscription.findOne({ user: userId })
        .sort({ updatedAt: -1 })
        .populate("plan")
        .lean(),
      Entitlement.find({ user: userId }).lean(),
    ]);
    const now = Date.now();
    res.json({
      subscription: sub || null,
      active: !!sub && ["active", "trialing"].includes(sub.status),
      entitlements: entitlements
        .filter((e) => !e.expiresAt || new Date(e.expiresAt).getTime() > now)
        .map((e) => ({ feature: e.feature, expiresAt: e.expiresAt })),
      stripeReady: STRIPE_READY,
      demo: !STRIPE_READY,
    });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/checkout { planCode }
   Demo mode: activates the subscription immediately and grants the plan's
   entitlements. Stripe mode: TODO (session creation) — still 501.
------------------------------------------------------------------ */
router.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    await ensurePlans();
    const planCode = String(req.body?.planCode || "premium_monthly");
    const plan = await Plan.findOne({ code: planCode, active: true });
    if (!plan) return res.status(404).json({ msg: "Plan not found." });

    if (STRIPE_READY) {
      // TODO: create a Stripe Checkout Session and return { url }.
      return res.status(501).json({ msg: "Stripe checkout is not wired yet." });
    }

    // ── demo checkout: activate right away ──
    const periodMs = plan.interval === "year" ? 365 * 864e5 : 30 * 864e5;
    const currentPeriodEnd = new Date(Date.now() + periodMs);
    const sub = await Subscription.findOneAndUpdate(
      { user: req.userId },
      {
        $set: {
          plan: plan._id,
          status: "active",
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: `demo_${req.userId}`,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const features = plan.features?.length ? plan.features : ["unlimited_swipes", "see_likes"];
    await Promise.all(
      features.map((feature) =>
        Entitlement.updateOne(
          { user: req.userId, feature },
          { $set: { source: "subscription", sourceRef: sub._id, expiresAt: null } },
          { upsert: true }
        )
      )
    );

    res.json({ ok: true, demo: true, subscription: { status: sub.status, currentPeriodEnd } });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/cancel
   Benefits stay until the period end: cancelAtPeriodEnd=true and the
   entitlements get an expiry instead of being deleted.
------------------------------------------------------------------ */
router.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({
      user: req.userId,
      status: { $in: ["active", "trialing"] },
    });
    if (!sub) return res.status(404).json({ msg: "No active subscription." });

    sub.cancelAtPeriodEnd = true;
    await sub.save();
    await Entitlement.updateMany(
      { user: req.userId, sourceRef: sub._id },
      { $set: { expiresAt: sub.currentPeriodEnd || new Date() } }
    );
    res.json({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: sub.currentPeriodEnd });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/portal — Stripe customer portal (TODO).
------------------------------------------------------------------ */
router.post("/portal", requireAuth, async (_req, res) => {
  if (!STRIPE_READY) {
    return res.status(501).json({ msg: "Stripe is not configured on the server." });
  }
  return res.status(501).json({ msg: "Customer portal is not wired yet." });
});

/* ------------------------------------------------------------------
   POST /api/billing/webhook — Stripe webhook (TODO). Always 2xx so
   Stripe retries don't pile up before it's wired.
------------------------------------------------------------------ */
router.post("/webhook", express.raw({ type: "application/json" }), async (_req, res) => {
  return res.status(200).json({ received: false, reason: "webhook_handler_not_wired" });
});

module.exports = router;
