// tests/billing.test.js
//
// GET /api/billing/plans (public catalog) + GET /api/billing/me (auth).

const request = require("supertest");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

let app;
let Plan;
let VerificationCode;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  Plan = require("../models/Plan");
  VerificationCode = require("../models/VerificationCode");
});

afterAll(async () => {
  await disconnectInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

async function registerAndGetToken() {
  const email = "user@example.com";
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
    .send({ email, password: "hunter2word", name: "User" });
  return reg.body.token;
}

describe("/api/billing", () => {
  it("returns active plans only, ordered by sortOrder", async () => {
    await Plan.insertMany([
      { code: "free", label: "Free", priceCents: 0, interval: "month", active: false, sortOrder: 0 },
      { code: "premium_year", label: "Yearly", priceCents: 9999, interval: "year", active: true, sortOrder: 0 },
      { code: "premium_month", label: "Monthly", priceCents: 999, interval: "month", active: true, sortOrder: 1 },
    ]);

    const res = await request(app).get("/api/billing/plans");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].code).toBe("premium_year"); // sortOrder 0 first
    expect(res.body[1].code).toBe("premium_month");
    expect(res.body.find((p) => p.code === "free")).toBeUndefined();
  });

  it("/billing/me returns null subscription + empty entitlements for a new user", async () => {
    const token = await registerAndGetToken();

    const res = await request(app)
      .get("/api/billing/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeNull();
    expect(res.body.entitlements).toEqual([]);
  });

  it("/billing/checkout returns 501 when Stripe is not configured", async () => {
    const token = await registerAndGetToken();

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ planCode: "premium_month" });

    expect(res.status).toBe(501);
  });
});
