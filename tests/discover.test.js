// tests/discover.test.js
//
// /api/discover must exclude:
//   - me
//   - users I've blocked
//   - users who've blocked me (mutual)
//   - users I've passed
//   - users I've already liked
//   - users I'm already matched with
// and must require a face photo + discoverable !== false.

const request = require("supertest");
const bcrypt = require("bcrypt");
const {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
} = require("./setup");

let app;
let User;
let Block;
let Pass;
let Like;
let Match;
let VerificationCode;

beforeAll(async () => {
  await connectInMemoryMongo();
  ({ app } = require("../server"));
  User = require("../models/User");
  Block = require("../models/Block");
  Pass = require("../models/Pass");
  Like = require("../models/Like");
  Match = require("../models/Match");
  VerificationCode = require("../models/VerificationCode");
});

afterAll(async () => {
  await disconnectInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

async function makeUser(email, opts = {}) {
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

  // every discoverable candidate needs a face photo
  if (opts.withFace !== false) {
    await User.findByIdAndUpdate(reg.body.user._id, {
      $push: {
        photos: { url: "https://example.com/face.jpg", type: "owner_face" },
      },
    });
  }
  return { token: reg.body.token, id: reg.body.user._id };
}

async function discover(token) {
  const res = await request(app)
    .get("/api/discover")
    .set("Authorization", `Bearer ${token}`);
  return res;
}

describe("/api/discover filtering", () => {
  it("excludes me from the results", async () => {
    const me = await makeUser("me@example.com");
    const other = await makeUser("other@example.com");

    const res = await discover(me.token);
    expect(res.status).toBe(200);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(me.id));
    expect(ids).toContain(String(other.id));
  });

  it("excludes users without a face photo", async () => {
    const me = await makeUser("me@example.com");
    const noFace = await makeUser("noface@example.com", { withFace: false });

    const res = await discover(me.token);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(noFace.id));
  });

  it("excludes users I've passed", async () => {
    const me = await makeUser("me@example.com");
    const target = await makeUser("target@example.com");
    await Pass.create({ owner: me.id, targetId: target.id });

    const res = await discover(me.token);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(target.id));
  });

  it("excludes users I've already liked", async () => {
    const me = await makeUser("me@example.com");
    const target = await makeUser("target@example.com");
    await Like.create({ owner: me.id, targetId: target.id });

    const res = await discover(me.token);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(target.id));
  });

  it("excludes blocked users (both directions)", async () => {
    const me = await makeUser("me@example.com");
    const iBlocked = await makeUser("iblocked@example.com");
    const theyBlockedMe = await makeUser("theyblocked@example.com");
    await Block.create({ owner: me.id, targetId: iBlocked.id });
    await Block.create({ owner: theyBlockedMe.id, targetId: me.id });

    const res = await discover(me.token);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(iBlocked.id));
    expect(ids).not.toContain(String(theyBlockedMe.id));
  });

  it("excludes users I'm already matched with", async () => {
    const me = await makeUser("me@example.com");
    const partner = await makeUser("partner@example.com");
    await Match.create({ users: [me.id, partner.id] });

    const res = await discover(me.token);
    const ids = res.body.map((u) => String(u._id ?? u.id));
    expect(ids).not.toContain(String(partner.id));
  });
});
