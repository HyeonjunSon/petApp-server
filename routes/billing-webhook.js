// server/routes/billing-webhook.js
//
// Stripe 웹훅 — server.js에서 express.json() **이전에** express.raw로 마운트된다
// (서명 검증에 원본 바이트가 필요하기 때문).
//
// 설계 노트:
//  · 멱등성: WebhookLog.stripeEventId 유니크 인덱스로 재전송을 1회만 처리.
//  · 권한 반영은 services/subscriptions.syncSubscription 하나로 통일.
//  · 키가 없으면 200 {received:false} — Stripe 재시도 폭주를 막는다.

const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const WebhookLog = require("../models/WebhookLog");
const { syncSubscription } = require("../services/subscriptions");

const SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** Stripe 구독 → 우리 Plan (price id로 매칭, 없으면 월간 기본값) */
async function planFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  if (priceId) {
    const byPrice = await Plan.findOne({ stripePriceId: priceId }).lean();
    if (byPrice) return byPrice;
  }
  return Plan.findOne({ code: "premium_monthly" }).lean();
}

const periodEnd = (sub) =>
  sub?.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;

/** Stripe 구독 객체 하나를 우리 상태로 반영 */
async function applySubscription(stripeSub, fallbackUserId) {
  const userId =
    stripeSub?.metadata?.userId ||
    fallbackUserId ||
    (await Subscription.findOne({ stripeSubscriptionId: stripeSub.id }).lean())?.user;
  if (!userId) return { skipped: "no user mapping" };

  const plan = await planFromSubscription(stripeSub);
  await syncSubscription({
    userId,
    plan,
    status: stripeSub.status,
    currentPeriodEnd: periodEnd(stripeSub),
    cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
    stripeCustomerId:
      typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id,
    stripeSubscriptionId: stripeSub.id,
  });
  return { ok: true };
}

module.exports = async function stripeWebhook(req, res) {
  if (!SECRET || !WEBHOOK_SECRET) {
    return res.status(200).json({ received: false, reason: "stripe_not_configured" });
  }

  const stripe = require("stripe")(SECRET);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Buffer (raw)
      req.headers["stripe-signature"],
      WEBHOOK_SECRET
    );
  } catch (e) {
    // 서명 불일치 = 신뢰할 수 없는 요청. 400이어야 Stripe가 재시도한다.
    return res.status(400).json({ message: `Webhook signature failed: ${e.message}` });
  }

  // ── 멱등성: 같은 이벤트가 두 번 와도 한 번만 처리 ──
  try {
    await WebhookLog.create({
      stripeEventId: event.id,
      type: event.type,
      payload: event.data?.object,
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.json({ received: true, duplicate: true }); // 이미 처리함
    }
    throw e;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const full = await stripe.subscriptions.retrieve(session.subscription);
          await applySubscription(full, session.metadata?.userId || session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(event.data.object);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const full = await stripe.subscriptions.retrieve(invoice.subscription);
          await applySubscription(full);
        }
        break;
      }
      default:
        break; // 관심 없는 이벤트도 200으로 ack
    }

    await WebhookLog.updateOne({ stripeEventId: event.id }, { $set: { processedAt: new Date() } });
    res.json({ received: true });
  } catch (e) {
    await WebhookLog.updateOne(
      { stripeEventId: event.id },
      { $set: { error: String(e?.message || e) } }
    );
    // 500 → Stripe가 백오프로 재시도 (로그의 error 필드로 추적 가능)
    res.status(500).json({ received: false, error: "handler_failed" });
  }
};
