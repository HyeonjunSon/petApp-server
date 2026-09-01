// tests/posts.test.js
//
// /api/posts — neighbourhood feed: create / list / react toggle / comment / delete.

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

describe("/api/posts", () => {
  it("creates a post and lists it newest-first", async () => {
    const me = await makeUser("me@example.com");

    const created = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ type: "walk-request", body: "Morning walk buddy wanted around 7." });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe("walk-request");
    expect(created.body.mine).toBe(true);

    await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ type: "lost", body: "Beagle slipped his collar near the park." });

    const list = await request(app).get("/api/posts").set(auth(me.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].type).toBe("lost"); // newest first
    expect(list.body[0].author.name).toBe("me");
  });

  it("rejects an empty body and an unknown type falls back to question", async () => {
    const me = await makeUser("me@example.com");
    const empty = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ type: "lost", body: "   " });
    expect(empty.status).toBe(400);

    const weird = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ type: "party", body: "hello" });
    expect(weird.status).toBe(201);
    expect(weird.body.type).toBe("question");
  });

  it("toggles a paw reaction", async () => {
    const me = await makeUser("me@example.com");
    const peer = await makeUser("peer@example.com");
    const post = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ body: "Water fountain works again." });

    const on = await request(app)
      .post(`/api/posts/${post.body.id}/react`)
      .set(auth(peer.token));
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ reacted: true, reactions: 1 });

    const off = await request(app)
      .post(`/api/posts/${post.body.id}/react`)
      .set(auth(peer.token));
    expect(off.body).toMatchObject({ reacted: false, reactions: 0 });
  });

  it("adds a comment and surfaces it as topComment in the list", async () => {
    const me = await makeUser("me@example.com");
    const peer = await makeUser("peer@example.com");
    const post = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ type: "question", body: "Any vet good with anxious huskies?" });

    const c = await request(app)
      .post(`/api/posts/${post.body.id}/comments`)
      .set(auth(peer.token))
      .send({ body: "Try the clinic on 5th — very patient." });
    expect(c.status).toBe(201);
    expect(c.body.commentCount).toBe(1);

    const list = await request(app).get("/api/posts").set(auth(me.token));
    expect(list.body[0].commentCount).toBe(1);
    expect(list.body[0].topComment.body).toMatch(/very patient/);
    expect(list.body[0].topComment.author).toBe("peer");
  });

  it("only the author can delete a post", async () => {
    const me = await makeUser("me@example.com");
    const peer = await makeUser("peer@example.com");
    const post = await request(app)
      .post("/api/posts")
      .set(auth(me.token))
      .send({ body: "delete me" });

    const forbidden = await request(app)
      .delete(`/api/posts/${post.body.id}`)
      .set(auth(peer.token));
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .delete(`/api/posts/${post.body.id}`)
      .set(auth(me.token));
    expect(ok.status).toBe(200);

    const list = await request(app).get("/api/posts").set(auth(me.token));
    expect(list.body).toHaveLength(0);
  });

  it("hides posts from blocked users", async () => {
    const me = await makeUser("me@example.com");
    const peer = await makeUser("peer@example.com");
    await request(app)
      .post("/api/posts")
      .set(auth(peer.token))
      .send({ body: "you should not see this after blocking" });

    await request(app)
      .post("/api/blocks")
      .set(auth(me.token))
      .send({ targetId: peer.id });

    const list = await request(app).get("/api/posts").set(auth(me.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
  });
});
