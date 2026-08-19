/**
 * Demo seeder — creates 10 virtual users (owner photo + pet + pet photos),
 * plus matches / messages / walk-invites / walk records anchored on the first
 * account so every screen has data. Re-runnable: it removes the previous demo
 * accounts (by email) and their related docs first.
 *
 * Photos: breed-matched stills from dog.ceo (static CDN) and Wikimedia Commons
 * (진돗개 — dog.ceo에 없음). Owner faces from randomuser.me. All URLs are
 * pinned (no random endpoints) so reseeding is deterministic.
 *
 *   cd petApp-server && node scripts/seed-demo.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const Pet = require("../models/Pet");
const Like = require("../models/Like");
const Match = require("../models/Match");
const Message = require("../models/Message");
const WalkInvite = require("../models/WalkInvite");
const Walk = require("../models/Walks");

const PASSWORD = "Petdate123!";
const SALT_ROUNDS = 10;

const face = (g, n) =>
  `https://randomuser.me/api/portraits/${g === "female" ? "women" : "men"}/${n}.jpg`;
const ceo = (p) => `https://images.dog.ceo/breeds/${p}`;
const wiki = (p) => `https://upload.wikimedia.org/wikipedia/commons/${p}`;

// 온도값(temperament)·크기(size)는 필터와 호환되도록 영문 값 유지 —
// 화면 한글 표기는 프론트(DiscoverCard의 TEMPER_KO/SIZE_KO)가 담당한다.
const PEOPLE = [
  { name: "Seojun Kim", gender: "male", region: "Seoul · Mapo", birthYear: 1994, goal: "both",
    about: "I run and walk along the Han River every weekend. Active dogs welcome!",
    interests: ["Running", "Cafés", "Camping"],
    pet: { name: "Choco", breed: "Pomeranian", age: 3, sex: "male", size: "s",
      temperament: ["Energetic", "Friendly"],
      about: "An energetic Pomeranian looking for a playmate to run around with!" },
    photos: [ceo("pomeranian/rafi_with_glasses.jpg"), ceo("pomeranian/pom-sophie-2.jpg"), ceo("pomeranian/pomeranian_black_01.jpg")] },
  { name: "Jiwoo Lee", gender: "female", region: "Seoul · Gangnam", birthYear: 1996, goal: "friends",
    about: "I love quiet neighborhood walks. Looking for a relaxed evening walk buddy.",
    interests: ["Yoga", "Baking"],
    pet: { name: "Mong", breed: "Maltese", age: 2, sex: "female", size: "s",
      temperament: ["Gentle", "Shy"],
      about: "Shy at first, but a total sweetheart once we're friends." },
    photos: [ceo("maltese/n20201012_img_0437.jpg"), ceo("maltese/n02085936_2465.jpg"), ceo("maltese/n02085936_8507.jpg")] },
  { name: "Minjun Park", gender: "male", region: "Seoul · Seongdong", birthYear: 1992, goal: "dating",
    about: "Often at Seoul Forest with my golden. Big-dog friends welcome.",
    interests: ["Hiking", "Photography", "Beer"],
    pet: { name: "Max", breed: "Golden Retriever", age: 3, sex: "male", size: "l",
      temperament: ["Energetic", "Friendly"],
      about: "A golden who truly loves people. Two walks a day!" },
    photos: [ceo("retriever-golden/nina.jpg"), ceo("retriever-golden/mori_4.jpg"), ceo("retriever-golden/joey_img_0261.jpg")] },
  { name: "Sua Choi", gender: "female", region: "Seoul · Songpa", birthYear: 1998, goal: "both",
    about: "Café-hopping and dog walks are my thing.",
    interests: ["Cafés", "Drawing"],
    pet: { name: "Dubu", breed: "Bichon Frise", age: 4, sex: "male", size: "s",
      temperament: ["Gentle", "Friendly"],
      about: "A cloud-like Bichon. Very social with lots of friends." },
    photos: [ceo("frise-bichon/h-1.jpg"), ceo("frise-bichon/h-2.jpg"), ceo("frise-bichon/4.jpg")] },
  { name: "Haneul Jung", gender: "male", region: "Seoul · Eunpyeong", birthYear: 1995, goal: "friends",
    about: "Morning walks with my Shiba every day. Looking for a morning walk partner.",
    interests: ["Running", "Coffee"],
    pet: { name: "Haru", breed: "Shiba Inu", age: 5, sex: "male", size: "m",
      temperament: ["Independent", "Energetic"],
      about: "A proud Shiba who genuinely loves walks." },
    photos: [ceo("shiba/shiba-16.jpg"), ceo("shiba/shiba-9.jpg"), ceo("shiba/shiba_20.jpg")] },
  { name: "Yeeun Kang", gender: "female", region: "Seoul · Seocho", birthYear: 1997, goal: "dating",
    about: "Corgi butt enthusiast. Love park walks.",
    interests: ["Travel", "Baking", "Movies"],
    pet: { name: "Bori", breed: "Welsh Corgi", age: 2, sex: "female", size: "m",
      temperament: ["Energetic", "Friendly"],
      about: "A corgi working hard on those short little legs!" },
    photos: [ceo("corgi/img_3428.jpg"), ceo("corgi/13263927_10154125975153449_6587119903523649180_n.jpg"), ceo("corgi/14917192_10154550690893449_81787730512372227_o.jpg")] },
  { name: "Dohyun Yoon", gender: "male", region: "Seoul · Yongsan", birthYear: 1993, goal: "both",
    about: "My beagle is full of energy. I enjoy long walks.",
    interests: ["Hiking", "Cycling"],
    pet: { name: "Kong", breed: "Beagle", age: 3, sex: "male", size: "m",
      temperament: ["Energetic", "Shy"],
      about: "A beagle whose favorite thing in the world is sniffing." },
    photos: [ceo("beagle/phoebe.jpg"), ceo("beagle/barnaby_2.jpg"), ceo("beagle/1374053345_milo.jpg")] },
  { name: "Chaewon Lim", gender: "female", region: "Seoul · Jongno", birthYear: 1999, goal: "friends",
    about: "Mostly evening walks. Small-dog friends welcome!",
    interests: ["Reading", "Cafés"],
    pet: { name: "Luna", breed: "Pomeranian", age: 1, sex: "female", size: "s",
      temperament: ["Energetic", "Friendly"],
      about: "Still a baby, so full of curiosity." },
    photos: [ceo("pomeranian/pomeranian_black_006.jpg"), ceo("pomeranian/pomeranian_black_05.jpg"), ceo("pomeranian/pomeranian_black_08.jpg")] },
  { name: "Jiho Han", gender: "male", region: "Seoul · Gwangjin", birthYear: 1991, goal: "dating",
    about: "Frequent walks at Children's Grand Park with my Jindo.",
    interests: ["Fitness", "Cooking"],
    pet: { name: "Mungchi", breed: "Jindo", age: 6, sex: "male", size: "l",
      temperament: ["Gentle", "Independent"],
      about: "A sturdy, calm Jindo." },
    photos: [wiki("1/18/Korea_Jindo_Dog.jpg"), wiki("8/8e/Jindo_dog_face.jpg"), wiki("thumb/7/77/Jindo_wiki.jpg/960px-Jindo_wiki.jpg")] },
  { name: "Seoyeon Oh", gender: "female", region: "Seoul · Dongjak", birthYear: 2000, goal: "both",
    about: "I like slow strolls around the block with my Shih Tzu.",
    interests: ["Drawing", "Walking", "Cafés"],
    pet: { name: "Coco", breed: "Shih Tzu", age: 4, sex: "female", size: "s",
      temperament: ["Gentle", "Friendly"],
      about: "A laid-back, affectionate Shih Tzu." },
    photos: [ceo("shihtzu/zoi_2.jpg"), ceo("shihtzu/oscar.jpg"), ceo("shihtzu/zoi_5.jpg")] },
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in .env");
  await mongoose.connect(uri);
  console.log("MongoDB connected");

  const emails = PEOPLE.map((_, i) => `demo${i + 1}@petdate.app`);

  // --- clean previous demo data (scoped to these emails) ---
  const existing = await User.find({ email: { $in: emails } }).select("_id").lean();
  const oldIds = existing.map((u) => u._id);
  if (oldIds.length) {
    const oldMatches = await Match.find({ users: { $in: oldIds } }).select("_id").lean();
    const oldMatchIds = oldMatches.map((m) => m._id);
    await Promise.all([
      Pet.deleteMany({ owner: { $in: oldIds } }),
      Like.deleteMany({ $or: [{ owner: { $in: oldIds } }, { targetId: { $in: oldIds.map(String) } }] }),
      Message.deleteMany({ $or: [{ from: { $in: oldIds } }, { match: { $in: oldMatchIds } }] }),
      WalkInvite.deleteMany({ $or: [{ from: { $in: oldIds } }, { to: { $in: oldIds } }] }),
      Walk.deleteMany({ owner: { $in: oldIds } }),
      Match.deleteMany({ _id: { $in: oldMatchIds } }),
    ]);
    await User.deleteMany({ _id: { $in: oldIds } });
    console.log(`Removed ${oldIds.length} previous demo user(s) and related data.`);
  }

  const hash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
  const created = [];

  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const email = emails[i];
    const faceUrl = face(p.gender, 10 + i * 5);
    const petPhotoUrls = p.photos;

    const user = await User.create({
      email,
      passwordHash: hash,
      name: p.name,
      gender: p.gender,
      birthYear: p.birthYear,
      locationName: p.region,
      about: p.about,
      goal: p.goal,
      interests: p.interests,
      verified: true,
      photos: [
        { url: faceUrl, type: "owner_face" },
        { url: petPhotoUrls[0], type: "pet" },
        { url: petPhotoUrls[1], type: "pet" },
      ],
      settings: { discoverable: true, push: true, species: "all", maxDistance: 20 },
    });

    const pet = await Pet.create({
      owner: user._id,
      name: p.pet.name,
      type: "dog",
      breed: p.pet.breed,
      age: p.pet.age,
      sex: p.pet.sex,
      size: p.pet.size,
      temperament: p.pet.temperament,
      about: p.pet.about,
      photos: petPhotoUrls.map((url) => ({ url })),
    });

    user.pets = [pet._id];
    await user.save();
    created.push({ user, pet, email, name: p.name, petName: p.pet.name });
  }

  // --- relationships anchored on the first account (demo1) ---
  const me = created[0].user;
  const mkMatch = async (a, b) => {
    await Like.updateOne({ owner: a._id, targetId: String(b._id) }, { $setOnInsert: {} }, { upsert: true });
    await Like.updateOne({ owner: b._id, targetId: String(a._id) }, { $setOnInsert: {} }, { upsert: true });
    return Match.create({ users: [a._id, b._id] });
  };

  const m1 = await mkMatch(me, created[1].user); // Mong · Jiwoo
  const m2 = await mkMatch(me, created[2].user); // Max · Minjun
  const m3 = await mkMatch(me, created[3].user); // Dubu · Sua

  // conversation in m1
  const msgs = await Message.create([
    { match: m1._id, from: created[1].user._id, text: "Hi! I think Choco and Mong would get along great on a walk 😊", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "I'd love that! Choco is pretty active too 🐶", seenBy: [me._id, created[1].user._id] },
    { match: m1._id, from: created[1].user._id, text: "How about Han River Park this weekend?", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "Sounds good! Are you free Saturday afternoon?", seenBy: [me._id] },
  ]);
  m1.lastMessage = msgs[msgs.length - 1]._id;
  await m1.save();

  // walk invites (plans). Records are never entered by hand — they flow from
  // completing a plan, so the completed one below also creates linked Walks.
  const d = (offset) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0, 10);
  };
  const past = (daysAgo, hour) => {
    const s = new Date();
    s.setDate(s.getDate() - daysAgo);
    s.setHours(hour, 0, 0, 0);
    return s;
  };
  const myPet = created[0].pet._id;

  await WalkInvite.create([
    { from: created[1].user._id, to: me._id, match: m1._id, date: d(3), time: "10:00", place: "Seoul Forest main gate", note: "Title: Weekend morning walk · Max 2 groups", status: "confirmed" },
    { from: me._id, to: created[2].user._id, match: m2._id, date: d(6), time: "15:00", place: "Han River Park, Ttukseom", note: "Title: Big-dog group walk", status: "proposed" },
  ]);

  // one COMPLETED past plan → auto-created walk records (one per participant)
  const started = past(4, 9);
  const myWalk = await Walk.create({ owner: me._id, pet: myPet, distanceKm: 2.9, durationMin: 45, startedAt: started, endedAt: started, notes: "Olympic Park" });
  const peerWalk = await Walk.create({ owner: created[3].user._id, pet: created[3].pet._id, distanceKm: 2.9, durationMin: 45, startedAt: started, endedAt: started, notes: "Olympic Park" });
  await WalkInvite.create({
    from: me._id, to: created[3].user._id, match: m3._id, date: d(-4), time: "09:00",
    place: "Olympic Park", note: "Title: Morning meetup", status: "completed",
    completedAt: new Date(), distanceKm: 2.9, durationMin: 45, linkedWalks: [myWalk._id, peerWalk._id],
  });

  // a couple of older records for my pet
  await Walk.create([
    { owner: me._id, pet: myPet, distanceKm: 3.2, durationMin: 48, startedAt: past(9, 10), endedAt: past(9, 10), notes: "Han River walk" },
    { owner: me._id, pet: myPet, distanceKm: 4.1, durationMin: 62, startedAt: past(12, 9), endedAt: past(12, 9), notes: "Long walk at Seoul Forest" },
  ]);

  console.log("\n=== DEMO ACCOUNTS (password is the same for all) ===");
  console.log(`PASSWORD: ${PASSWORD}\n`);
  created.forEach((c, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${c.email}   | ${c.name} · ${c.petName}`)
  );
  console.log(`\nRecommended login: demo1@petdate.app (has matches / chat / walk plans / records)`);

  await mongoose.disconnect();
  console.log("\nDone. Disconnected.");
}

run().catch(async (e) => {
  console.error("Seed failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
