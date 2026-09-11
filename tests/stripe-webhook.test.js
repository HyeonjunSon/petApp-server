// tests/stripe-webhook.test.js
//
// Stripe 웹훅 — 서명 검증 / 멱등성 / 구독→권한 반영.
// 네트워크 없이 동작한다: Stripe SDK의 테스트용 서명 생성기를 쓰고,
// 이벤트 객체만으로 처리되는 customer.subscription.* 만 다룬다.

// ⚠️ server(=billing-webhook)가 require 시점에 env를 읽으므로 먼저 설정한다.
process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_signature_only";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const request = require("supertest");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

let app;
let VerificationCode;
let Plan;
let Entitlement;
let stripe;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  VerificationCode = require("../models/VerificationCode");
  Plan = require("../models/Plan");
  Entitlement = require("../models/Entitlement");
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
});

afterAll(async () => {
  await disconnectInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

async function makeUser(email = "me@example.com") {
  const codeHash = await bcrypt.hash("123456", 4);
  await VerificationCode.create({
    email,
    codeHash,
    purpose: "verify_email",
    verified: true,
    attempts: 0,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "hunter2word", name: "Me" });
  return { token: reg.body.token, id: reg.body.user._id };
}

/** Stripe가 보내는 것과 동일한 형태의 서명된 요청을 만든다 */
function signedPost(eventObject) {
  const payload = JSON.stringify(eventObject);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return request(app)
    .post("/api/billing/webhook")
    .set("stripe-signature", header)
    .set("Content-Type", "application/json")
    // ⚠️ Buffer로 보내면 supertest가 JSON으로 재직렬화해 원본 바이트가 바뀐다 → 문자열로 전송
    .send(payload);
}

const subscriptionEvent = ({
  id = "evt_1",
  type = "customer.subscription.updated",
  userId,
  status = "active",
  cancelAtPeriodEnd = false,
  priceId,
}) => ({
  id,
  type,
  data: {
    object: {
      id: "sub_test_123",
      object: "subscription",
      status,
      customer: "cus_test_123",
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: Math.floor((Date.now() + 30 * 864e5) / 1000),
      metadata: { userId: String(userId) },
      items: { data: [{ price: { id: priceId || "price_test" } }] },
    },
  },
});

describe("POST /api/billing/webhook", () => {
  it("rejects a request with a bad signature", async () => {
    const res = await request(app)
      .post("/api/billing/webhook")
      .set("stripe-signature", "t=1,v1=deadbeef")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_bad", type: "ping" }));
    expect(res.status).toBe(400);
  });

  it("activates the subscription and grants entitlements", async () => {
    const me = await makeUser();
    await Plan.create({
      code: "premium_monthly",
      label: "Offleash Premium",
      priceCents: 999,
      currency: "CAD",
      interval: "month",
      features: ["unlimited_swipes", "see_likes"],
      active: true,
    });

    const res = await signedPost(subscriptionEvent({ userId: me.id }));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const meRes = await request(app)
      .get("/api/billing/me")
      .set("Authorization", `Bearer ${me.token}`);
    expect(meRes.body.active).toBe(true);
    expect(meRes.body.subscription.stripeSubscriptionId).toBe("sub_test_123");
    expect(meRes.body.entitlements.map((e) => e.feature)).toEqual(
      expect.arrayContaining(["unlimited_swipes", "see_likes"])
    );
  });

  it("processes a retried event only once (idempotency)", async () => {
    const me = await makeUser();
    const event = subscriptionEvent({ id: "evt_dup", userId: me.id });

    const first = await signedPost(event);
    expect(first.body).toMatchObject({ received: true });
    expect(first.body.duplicate).toBeUndefined();

    const second = await signedPost(event); // Stripe 재전송
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  it("revokes entitlements when the subscription is deleted", async () => {
    const me = await makeUser();
    await signedPost(subscriptionEvent({ id: "evt_a", userId: me.id }));

    await signedPost(
      subscriptionEvent({
        id: "evt_b",
        type: "customer.subscription.deleted",
        userId: me.id,
        status: "canceled",
      })
    );

    const meRes = await request(app)
      .get("/api/billing/me")
      .set("Authorization", `Bearer ${me.token}`);
    expect(meRes.body.active).toBe(false);
    expect(meRes.body.entitlements).toEqual([]); // 만료 처리되어 노출되지 않음

    // 권한 레코드는 남아 있되 expiresAt이 과거여야 한다 (감사 추적)
    const rows = await Entitlement.find({ user: me.id }).lean();
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(new Date(r.expiresAt).getTime()).toBeLessThanOrEqual(Date.now()));
  });

  it("caps benefits at period end when cancel_at_period_end is set", async () => {
    const me = await makeUser();
    await signedPost(
      subscriptionEvent({ id: "evt_c", userId: me.id, cancelAtPeriodEnd: true })
    );

    const meRes = await request(app)
      .get("/api/billing/me")
      .set("Authorization", `Bearer ${me.token}`);
    expect(meRes.body.active).toBe(true); // 아직 유효
    expect(meRes.body.subscription.cancelAtPeriodEnd).toBe(true);
    meRes.body.entitlements.forEach((e) => expect(e.expiresAt).toBeTruthy());
  });
});
