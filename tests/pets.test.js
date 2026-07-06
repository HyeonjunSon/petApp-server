// tests/pets.test.js
//
// Pets CRUD + owner gate. Verifies that:
//   - Creating a pet attaches the current user as owner.
//   - GET /pets only returns mine.
//   - Updating/deleting someone else's pet is forbidden.

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

describe("/api/pets", () => {
  it("creates a pet with the current user as owner", async () => {
    const me = await makeUser("alice@example.com");

    const res = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${me.token}`)
      .send({
        name: "Bori",
        type: "dog",
        breed: "Maltese",
        age: 3,
        sex: "male",
        size: "s",
        temperament: ["Calm", "Friendly"],
        about: "Loves the park.",
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body._id).toBeTruthy();
    expect(res.body.name).toBe("Bori");
    expect(String(res.body.owner)).toBe(String(me.id));
  });

  it("GET /pets returns only the caller's pets", async () => {
    const alice = await makeUser("alice@example.com");
    const bob = await makeUser("bob@example.com");

    await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Bori", type: "dog" });
    await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ name: "Coco", type: "dog" });

    const aRes = await request(app)
      .get("/api/pets")
      .set("Authorization", `Bearer ${alice.token}`);

    expect(aRes.status).toBe(200);
    expect(aRes.body).toHaveLength(1);
    expect(aRes.body[0].name).toBe("Bori");
  });

  it("forbids updating someone else's pet", async () => {
    const alice = await makeUser("alice@example.com");
    const bob = await makeUser("bob@example.com");

    const create = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Bori", type: "dog" });
    const petId = create.body._id;

    const res = await request(app)
      .put(`/api/pets/${petId}`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ name: "Stolen" });

    expect([403, 404]).toContain(res.status);
  });

  it("forbids deleting someone else's pet", async () => {
    const alice = await makeUser("alice@example.com");
    const bob = await makeUser("bob@example.com");

    const create = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ name: "Bori", type: "dog" });
    const petId = create.body._id;

    const res = await request(app)
      .delete(`/api/pets/${petId}`)
      .set("Authorization", `Bearer ${bob.token}`);

    expect([403, 404]).toContain(res.status);

    // ensure the pet is still there
    const stillThere = await request(app)
      .get(`/api/pets/${petId}`)
      .set("Authorization", `Bearer ${alice.token}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.name).toBe("Bori");
  });

  it("owner can update and delete their own pet", async () => {
    const me = await makeUser("alice@example.com");

    const create = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${me.token}`)
      .send({ name: "Bori", type: "dog", about: "first version" });
    const petId = create.body._id;

    const upd = await request(app)
      .put(`/api/pets/${petId}`)
      .set("Authorization", `Bearer ${me.token}`)
      .send({ about: "second version" });
    expect(upd.status).toBe(200);
    expect(upd.body.about).toBe("second version");

    const del = await request(app)
      .delete(`/api/pets/${petId}`)
      .set("Authorization", `Bearer ${me.token}`);
    expect([200, 204]).toContain(del.status);

    const list = await request(app)
      .get("/api/pets")
      .set("Authorization", `Bearer ${me.token}`);
    expect(list.body).toHaveLength(0);
  });
});
