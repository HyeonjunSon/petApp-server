// tests/blocks.test.js
//
// /api/blocks — list / create / delete by id.

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
    .send({ email, password: "hunter2word", name: email });
  return { token: reg.body.token, id: reg.body.user._id };
}

describe("/api/blocks", () => {
  it("creates and lists a block", async () => {
    const me = await makeUser("me@example.com");
    const target = await makeUser("target@example.com");

    const post = await request(app)
      .post("/api/blocks")
      .set("Authorization", `Bearer ${me.token}`)
      .send({ targetId: target.id });
    expect([200, 201]).toContain(post.status);

    const list = await request(app)
      .get("/api/blocks")
      .set("Authorization", `Bearer ${me.token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toHaveLength(1);
    expect(String(list.body[0].targetId)).toBe(String(target.id));
  });

  it("unblocks by row id", async () => {
    const me = await makeUser("me@example.com");
    const target = await makeUser("target@example.com");

    await request(app)
      .post("/api/blocks")
      .set("Authorization", `Bearer ${me.token}`)
      .send({ targetId: target.id });

    const list = await request(app)
      .get("/api/blocks")
      .set("Authorization", `Bearer ${me.token}`);
    const blockId = list.body[0]._id;

    const del = await request(app)
      .delete(`/api/blocks/${blockId}`)
      .set("Authorization", `Bearer ${me.token}`);
    expect([200, 204]).toContain(del.status);

    const after = await request(app)
      .get("/api/blocks")
      .set("Authorization", `Bearer ${me.token}`);
    expect(after.body).toHaveLength(0);
  });
});
