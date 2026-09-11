// server/routes/billing.js
//
// 구독 결제. 두 가지 모드가 **같은 데이터 레이어**를 공유한다:
//   · Stripe 모드 (STRIPE_SECRET_KEY 설정 시): Checkout Session → 웹훅이 상태 동기화
//   · 데모 모드 (기본): 즉시 활성화. 키 없이도 전체 플로우를 시연할 수 있다.
// 권한 반영은 양쪽 모두 services/subscriptions.syncSubscription 하나를 호출한다.

const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");

const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const Entitlement = require("../models/Entitlement");
const { syncSubscription } = require("../services/subscriptions");

const STRIPE_READY = !!process.env.STRIPE_SECRET_KEY;
const stripe = () => require("stripe")(process.env.STRIPE_SECRET_KEY);

const APP_URL = (process.env.APP_URL || "https://pet-app-frontend-fawn.vercel.app").replace(
  /\/+$/,
  ""
);

const DEFAULT_PLANS = [
  {
    code: "premium_monthly",
    label: "Offleash Premium",
    description: "Unlimited swipes, see who liked you, premium badge.",
    priceCents: 999, // $9.99 CAD
    currency: "CAD",
    interval: "month",
    features: ["unlimited_swipes", "see_likes"],
    sortOrder: 0,
  },
  {
    code: "premium_yearly",
    label: "Offleash Premium (yearly)",
    description: "Two months free on the yearly plan.",
    priceCents: 9999, // $99.99 CAD
    currency: "CAD",
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
   Stripe 모드 → Checkout Session URL 반환 (활성화는 웹훅이 담당).
   데모 모드   → 즉시 활성화.
------------------------------------------------------------------ */
router.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    await ensurePlans();
    const planCode = String(req.body?.planCode || "premium_monthly");
    const plan = await Plan.findOne({ code: planCode, active: true });
    if (!plan) return res.status(404).json({ msg: "Plan not found." });

    if (STRIPE_READY) {
      // 대시보드에 상품을 미리 만들어 두지 않아도 되도록, price가 없으면
      // 우리 Plan 레코드로 price_data를 즉석 구성한다.
      const lineItem = plan.stripePriceId
        ? { price: plan.stripePriceId, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: (plan.currency || "CAD").toLowerCase(),
              unit_amount: plan.priceCents,
              recurring: { interval: plan.interval === "year" ? "year" : "month" },
              product_data: {
                name: plan.label,
                description: plan.description || undefined,
              },
            },
          };

      const existing = await Subscription.findOne({ user: req.userId })
        .select("stripeCustomerId")
        .lean();

      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [lineItem],
        success_url: `${APP_URL}/subscription?checkout=success`,
        cancel_url: `${APP_URL}/subscription?checkout=cancelled`,
        client_reference_id: String(req.userId),
        ...(existing?.stripeCustomerId ? { customer: existing.stripeCustomerId } : {}),
        // 웹훅에서 유저를 찾을 수 있도록 양쪽에 심는다
        metadata: { userId: String(req.userId), planCode: plan.code },
        subscription_data: { metadata: { userId: String(req.userId), planCode: plan.code } },
      });

      return res.json({ url: session.url, stripe: true });
    }

    // ── demo checkout: activate right away ──
    const periodMs = plan.interval === "year" ? 365 * 864e5 : 30 * 864e5;
    const currentPeriodEnd = new Date(Date.now() + periodMs);
    const sub = await syncSubscription({
      userId: req.userId,
      plan,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: `demo_${req.userId}`,
    });

    res.json({ ok: true, demo: true, subscription: { status: sub.status, currentPeriodEnd } });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/cancel
   혜택은 기간 만료일까지 유지 (cancel_at_period_end).
------------------------------------------------------------------ */
router.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({
      user: req.userId,
      status: { $in: ["active", "trialing"] },
    }).populate("plan");
    if (!sub) return res.status(404).json({ msg: "No active subscription." });

    if (STRIPE_READY && sub.stripeSubscriptionId && !sub.stripeSubscriptionId.startsWith("demo_")) {
      // Stripe가 정본 — 우리 상태는 웹훅으로 따라온다. 단 UI 즉시 반영을 위해 미리 반영.
      await stripe().subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    await syncSubscription({
      userId: req.userId,
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: sub.stripeSubscriptionId,
    });

    res.json({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: sub.currentPeriodEnd });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------
   POST /api/billing/portal — Stripe 고객 포털 (카드 변경·영수증·해지)
------------------------------------------------------------------ */
router.post("/portal", requireAuth, async (req, res, next) => {
  try {
    if (!STRIPE_READY) {
      return res.status(501).json({ msg: "Stripe is not configured on the server." });
    }
    const sub = await Subscription.findOne({ user: req.userId }).select("stripeCustomerId").lean();
    if (!sub?.stripeCustomerId) {
      return res.status(404).json({ msg: "No billing account yet." });
    }
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${APP_URL}/subscription/billing`,
    });
    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

// NOTE: POST /api/billing/webhook 은 server.js에서 express.json() **이전에**
// express.raw로 마운트된다 (routes/billing-webhook.js). 서명 검증용 원본 바이트 필요.

module.exports = router;
