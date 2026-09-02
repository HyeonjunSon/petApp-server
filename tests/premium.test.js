// tests/premium.test.js
//
// Demo billing lifecycle + likes-me gating:
// checkout activates entitlements → likes-me unlocks → cancel caps benefits.

const request = require("supertest");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

let app;
let VerificationCode;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  VerificationCode = require("../models/VerificationCode");
});

afterAll(async () => {
  await disconnectInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

async function makeUser(email) {
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
    .send({ email, password: "hunter2word", name: email.split("@")[0] });
  return { token: reg.body.token, id: reg.body.user._id };
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("demo billing + likes-me", () => {
  it("demo checkout activates the subscription and grants entitlements", async () => {
    const me = await makeUser("me@example.com");

    const co = await request(app)
      .post("/api/billing/checkout")
      .set(auth(me.token))
      .send({ planCode: "premium_monthly" });
    expect(co.status).toBe(200);
    expect(co.body).toMatchObject({ ok: true, demo: true });

    const meRes = await request(app).get("/api/billing/me").set(auth(me.token));
    expect(meRes.body.active).toBe(true);
    const features = meRes.body.entitlements.map((e) => e.feature);
    expect(features).toEqual(expect.arrayContaining(["unlimited_swipes", "see_likes"]));
  });

  it("likes-me is locked (count only) for free users and unlocked after checkout", async () => {
    const me = await makeUser("me@example.com");
    const fan = await makeUser("fan@example.com");

    // fan likes me (one-way)
    await request(app).post(`/api/matches/like/${me.id}`).set(auth(fan.token));

    const locked = await request(app).get("/api/matches/likes-me").set(auth(me.token));
    expect(locked.status).toBe(200);
    expect(locked.body).toEqual({ locked: true, count: 1 });

    await request(app)
      .post("/api/billing/checkout")
      .set(auth(me.token))
      .send({ planCode: "premium_monthly" });

    const open = await request(app).get("/api/matches/likes-me").set(auth(me.token));
    expect(open.body.locked).toBe(false);
    expect(open.body.users).toHaveLength(1);
    expect(open.body.users[0].name).toBe("fan");

    // like back → match, and the liker leaves the likes-me list
    const like = await request(app)
      .post(`/api/matches/like/${fan.id}`)
      .set(auth(me.token));
    expect(like.body.matched).toBe(true);

    const after = await request(app).get("/api/matches/likes-me").set(auth(me.token));
    expect(after.body.users).toHaveLength(0);
  });

  it("cancel keeps benefits until period end (cancelAtPeriodEnd + expiry)", async () => {
    const me = await makeUser("me@example.com");
    await request(app)
      .post("/api/billing/checkout")
      .set(auth(me.token))
      .send({ planCode: "premium_monthly" });

    const cancel = await request(app).post("/api/billing/cancel").set(auth(me.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelAtPeriodEnd).toBe(true);

    // still active, entitlements now carry a future expiry (still valid today)
    const meRes = await request(app).get("/api/billing/me").set(auth(me.token));
    expect(meRes.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(meRes.body.entitlements.length).toBeGreaterThan(0);
    meRes.body.entitlements.forEach((e) => expect(e.expiresAt).toBeTruthy());
  });

  it("cancel without an active subscription returns 404", async () => {
    const me = await makeUser("me@example.com");
    const res = await request(app).post("/api/billing/cancel").set(auth(me.token));
    expect(res.status).toBe(404);
  });
});
