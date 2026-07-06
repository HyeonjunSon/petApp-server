// tests/auth.test.js
//
// Register → login → me. Bypasses the email-code verification step by
// inserting a pre-verified VerificationCode row, which mirrors what
// /auth/verify-code does in the happy path.

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

async function plantVerifiedCode(email) {
  const code = "123456";
  const codeHash = await bcrypt.hash(code, 4);
  await VerificationCode.create({
    email,
    codeHash,
    purpose: "verify_email",
    verified: true,
    attempts: 0,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  return code;
}

describe("/api/auth", () => {
  it("registers a user with a verified email + returns a token", async () => {
    const email = "alice@example.com";
    await plantVerifiedCode(email);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "hunter2word", name: "Alice" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user?.email).toBe(email);
  });

  it("logs in with the registered password", async () => {
    const email = "bob@example.com";
    await plantVerifiedCode(email);
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "hunter2word", name: "Bob" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "hunter2word" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects login with the wrong password", async () => {
    const email = "carol@example.com";
    await plantVerifiedCode(email);
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "hunter2word", name: "Carol" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong-pass-123" });

    expect(res.status).toBe(400);
  });

  it("change-password requires the current password to match", async () => {
    const email = "dave@example.com";
    await plantVerifiedCode(email);
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "hunter2word", name: "Dave" });
    const token = reg.body.token;

    const bad = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong", newPassword: "newpass1234" });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "hunter2word", newPassword: "newpass1234" });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });
});
