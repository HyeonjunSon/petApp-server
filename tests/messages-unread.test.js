// tests/messages-unread.test.js
//
// GET /api/messages/unread counts incoming messages I haven't marked as seen.

const request = require("supertest");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

let app;
let Match;
let Message;
let VerificationCode;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  Match = require("../models/Match");
  Message = require("../models/Message");
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

describe("GET /api/messages/unread", () => {
  it("returns 0 for a user with no matches", async () => {
    const me = await makeUser("me@example.com");

    const res = await request(app)
      .get("/api/messages/unread")
      .set("Authorization", `Bearer ${me.token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("counts only incoming messages I haven't seen", async () => {
    const me = await makeUser("me@example.com");
    const them = await makeUser("them@example.com");

    const match = await Match.create({ users: [me.id, them.id] });

    // 2 incoming, unseen
    await Message.create({ match: match._id, from: them.id, text: "hi" });
    await Message.create({ match: match._id, from: them.id, text: "you?" });
    // 1 incoming, already seen
    await Message.create({
      match: match._id,
      from: them.id,
      text: "earlier",
      seenBy: [me.id],
    });
    // 1 from me — should not count
    await Message.create({ match: match._id, from: me.id, text: "mine" });

    const res = await request(app)
      .get("/api/messages/unread")
      .set("Authorization", `Bearer ${me.token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});
