// tests/like-gate.test.js
//
// POST /api/matches/like/:id daily limit gate.
// Stuffs N likes for "alice" today, then expects the (N+1)th to 402.
// With an "unlimited_swipes" entitlement, the same call goes through.

const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

const FREE_LIMIT = 30;

let app;
let User;
let Like;
let Entitlement;
let VerificationCode;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  User = require("../models/User");
  Like = require("../models/Like");
  Entitlement = require("../models/Entitlement");
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
    .send({ email, password: "hunter2word", name: email });
  return { token: reg.body.token, id: reg.body.user._id };
}

describe("POST /api/matches/like/:id daily limit", () => {
  it("blocks the (FREE_LIMIT+1)th like with 402 + paywall feature key", async () => {
    const me = await makeUser("alice@example.com");
    const target = await makeUser("target@example.com");

    // Seed FREE_LIMIT likes from alice today against synthetic uids — they
    // don't have to be real users for the count gate.
    const today = new Date();
    const fakeTargets = Array.from({ length: FREE_LIMIT }, () =>
      new mongoose.Types.ObjectId()
    );
    await Like.insertMany(
      fakeTargets.map((tid) => ({
        owner: me.id,
        targetId: tid,
        createdAt: today,
      }))
    );

    const res = await request(app)
      .post(`/api/matches/like/${target.id}`)
      .set("Authorization", `Bearer ${me.token}`);

    expect(res.status).toBe(402);
    expect(res.body.feature).toBe("unlimited_swipes");
  });

  it("lets the (FREE_LIMIT+1)th through when the user has unlimited_swipes", async () => {
    const me = await makeUser("alice@example.com");
    const target = await makeUser("target@example.com");

    const fakeTargets = Array.from({ length: FREE_LIMIT }, () =>
      new mongoose.Types.ObjectId()
    );
    await Like.insertMany(
      fakeTargets.map((tid) => ({ owner: me.id, targetId: tid }))
    );
    await Entitlement.create({
      user: me.id,
      feature: "unlimited_swipes",
      source: "subscription",
    });

    const res = await request(app)
      .post(`/api/matches/like/${target.id}`)
      .set("Authorization", `Bearer ${me.token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.matched).toBe(false);
  });
});
