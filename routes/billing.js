// server/routes/billing.js
//
// Billing routes — Sprint 4 foundation. Models + admin/read endpoints are live;
// the Stripe-touching endpoints (checkout, portal, webhook) return 501 until
// STRIPE_SECRET_KEY is configured. Once you set the env var, swap the 501
// blocks for actual Stripe SDK calls — the data layer is already in place.

const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");

const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const Entitlement = require("../models/Entitlement");
const WebhookLog = require("../models/WebhookLog");

const STRIPE_READY = !!process.env.STRIPE_SECRET_KEY;

/* ------------------------------------------------------------------
   GET /api/billing/plans
   Public catalog. No auth — paywall renders this before login too.
------------------------------------------------------------------ */
router.get("/plans", async (_req, res, next) => {
  try {
    const plans = await Plan.find({ active: true })
      .sort({ sortOrder: 1, priceCents: 1 })
      .lean();
    res.json(plans);
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   GET /api/billing/me
   Authenticated. Returns the current subscription + entitlements snapshot
   so clients can gate features without a Stripe round-trip.
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
    res.json({
      subscription: sub || null,
      entitlements: entitlements.map((e) => ({
        feature: e.feature,
        expiresAt: e.expiresAt,
      })),
      stripeReady: STRIPE_READY,
    });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/checkout
   Authenticated. Creates a Stripe Checkout Session for the given plan.
   Stub returns 501 until STRIPE_SECRET_KEY is set.
------------------------------------------------------------------ */
router.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    if (!STRIPE_READY) {
      return res
        .status(501)
        .json({ msg: "Stripe is not configured on the server." });
    }
    const { planCode } = req.body || {};
    if (!planCode) return res.status(400).json({ msg: "planCode is required." });
    const plan = await Plan.findOne({ code: planCode, active: true });
    if (!plan || !plan.stripePriceId)
      return res.status(404).json({ msg: "Plan not found." });

    // TODO when STRIPE_SECRET_KEY is set:
    //   const Stripe = require("stripe");
    //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    //   const session = await stripe.checkout.sessions.create({ ... });
    //   return res.json({ url: session.url });

    return res
      .status(501)
      .json({ msg: "Checkout creation is not wired yet." });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/portal
   Authenticated. Creates a Stripe Customer Portal session for self-service
   plan management. Stub until STRIPE_SECRET_KEY is set.
------------------------------------------------------------------ */
router.post("/portal", requireAuth, async (_req, res, next) => {
  try {
    if (!STRIPE_READY) {
      return res
        .status(501)
        .json({ msg: "Stripe is not configured on the server." });
    }
    // TODO: stripe.billingPortal.sessions.create({ customer: ..., return_url: ... })
    return res.status(501).json({ msg: "Customer portal is not wired yet." });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/webhook
   Public (Stripe calls it). MUST be mounted with express.raw before app.json
   middleware so the signature can be verified. Stub logs the event and
   acks 200 even without Stripe wired so retries don't pile up.
------------------------------------------------------------------ */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    if (!STRIPE_READY) {
      // Don't fail Stripe — just no-op. The caller (Stripe) needs 2xx.
      return res.status(200).json({ received: false, reason: "stripe_not_configured" });
    }

    // TODO when STRIPE_WEBHOOK_SECRET is set:
    //   const sig = req.headers["stripe-signature"];
    //   const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    //   await WebhookLog.create({ stripeEventId: event.id, type: event.type, payload: event.data?.object });
    //   switch (event.type) { ... update Subscription/Entitlement ... }
    //   return res.json({ received: true });

    return res
      .status(200)
      .json({ received: false, reason: "webhook_handler_not_wired" });
  } catch (e) {
    // Log + 400 so Stripe retries with backoff.
    next(e);
  }
});

module.exports = router;
