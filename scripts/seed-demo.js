/**
 * Demo seeder — creates 10 virtual users (owner photo + pet + pet photos),
 * plus matches / messages / walk-invites / walk records anchored on the first
 * account so every screen has data. Re-runnable: it removes the previous demo
 * accounts (by email) and their related docs first.
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
const dog = (id) => `https://placedog.net/560/560?id=${id}`;

const PEOPLE = [
  { name: "김서준", gender: "male",   region: "서울 마포구", birthYear: 1994, goal: "both",
    about: "주말마다 한강에서 러닝하고 산책해요. 활발한 강아지 환영!",
    interests: ["러닝", "카페", "캠핑"],
    pet: { name: "초코", breed: "포메라니안", age: 3, sex: "male",   size: "s", temperament: ["활발해요", "친화적이에요"], about: "에너지 넘치는 포메예요. 같이 뛰어놀 친구를 찾아요!" } },
  { name: "이지우", gender: "female", region: "서울 강남구", birthYear: 1996, goal: "friends",
    about: "조용한 동네 산책을 좋아해요. 느긋한 저녁 산책 메이트 구해요.",
    interests: ["요가", "베이킹"],
    pet: { name: "몽이", breed: "말티즈", age: 2, sex: "female", size: "s", temperament: ["온순해요", "낯가림 있어요"], about: "부끄럼 많지만 친해지면 애교쟁이예요." } },
  { name: "박민준", gender: "male",   region: "서울 성동구", birthYear: 1992, goal: "dating",
    about: "골든이랑 서울숲 자주 가요. 대형견 친구 환영합니다.",
    interests: ["등산", "사진", "맥주"],
    pet: { name: "맥스", breed: "골든리트리버", age: 3, sex: "male", size: "l", temperament: ["활발해요", "친화적이에요"], about: "사람을 정말 좋아하는 골든이에요. 산책은 하루 2회!" } },
  { name: "최수아", gender: "female", region: "서울 송파구", birthYear: 1998, goal: "both",
    about: "카페 투어와 강아지 산책이 취미예요.",
    interests: ["카페", "그림"],
    pet: { name: "두부", breed: "비숑프리제", age: 4, sex: "male", size: "s", temperament: ["온순해요", "친화적이에요"], about: "구름 같은 비숑이에요. 사교적이라 친구가 많아요." } },
  { name: "정하늘", gender: "male",   region: "서울 은평구", birthYear: 1995, goal: "friends",
    about: "시바랑 매일 아침 산책합니다. 아침 산책 파트너 구해요.",
    interests: ["러닝", "커피"],
    pet: { name: "하루", breed: "시바견", age: 5, sex: "male", size: "m", temperament: ["독립적이에요", "활발해요"], about: "도도한 시바지만 산책은 정말 좋아해요." } },
  { name: "강예은", gender: "female", region: "서울 서초구", birthYear: 1997, goal: "dating",
    about: "코기 엉덩이에 진심입니다. 공원 산책 좋아요.",
    interests: ["여행", "베이킹", "영화"],
    pet: { name: "보리", breed: "웰시코기", age: 2, sex: "female", size: "m", temperament: ["활발해요", "친화적이에요"], about: "짧은 다리로 열심히 걷는 코기예요!" } },
  { name: "윤도현", gender: "male",   region: "서울 용산구", birthYear: 1993, goal: "both",
    about: "비글이라 에너지가 넘쳐요. 오래 걷는 산책 좋아합니다.",
    interests: ["등산", "자전거"],
    pet: { name: "콩이", breed: "비글", age: 3, sex: "male", size: "m", temperament: ["활발해요", "낯가림 있어요"], about: "냄새 맡는 걸 세상에서 제일 좋아하는 비글." } },
  { name: "임채원", gender: "female", region: "서울 종로구", birthYear: 1999, goal: "friends",
    about: "저녁 산책 위주로 다녀요. 작은 강아지 친구 환영!",
    interests: ["독서", "카페"],
    pet: { name: "루나", breed: "포메라니안", age: 1, sex: "female", size: "s", temperament: ["활발해요", "친화적이에요"], about: "아직 아기라 호기심이 많아요." } },
  { name: "한지호", gender: "male",   region: "서울 광진구", birthYear: 1991, goal: "dating",
    about: "진돗개와 어린이대공원 자주 산책해요.",
    interests: ["헬스", "요리"],
    pet: { name: "뭉치", breed: "진돗개", age: 6, sex: "male", size: "l", temperament: ["온순해요", "독립적이에요"], about: "듬직하고 차분한 진돗개예요." } },
  { name: "오서연", gender: "female", region: "서울 동작구", birthYear: 2000, goal: "both",
    about: "시츄랑 느긋하게 동네 한 바퀴 도는 걸 좋아해요.",
    interests: ["그림", "산책", "카페"],
    pet: { name: "코코", breed: "시츄", age: 4, sex: "female", size: "s", temperament: ["온순해요", "친화적이에요"], about: "느긋하고 다정한 시츄예요." } },
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
    const petPhotoUrls = [dog(20 + i * 3), dog(21 + i * 3), dog(22 + i * 3)];

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

  const m1 = await mkMatch(me, created[1].user); // 몽이 · 이지우
  const m2 = await mkMatch(me, created[2].user); // 맥스 · 박민준
  await mkMatch(me, created[3].user);            // 두부 · 최수아

  // conversation in m1
  const msgs = await Message.create([
    { match: m1._id, from: created[1].user._id, text: "안녕하세요! 초코랑 몽이 같이 산책하면 좋을 것 같아요 😊", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "저도 좋아요! 초코도 활발한 편이에요 🐶", seenBy: [me._id, created[1].user._id] },
    { match: m1._id, from: created[1].user._id, text: "혹시 주말에 한강공원 어때요?", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "좋아요! 토요일 오후 괜찮으세요?", seenBy: [me._id] },
  ]);
  m1.lastMessage = msgs[msgs.length - 1]._id;
  await m1.save();

  // walk invites
  const d = (offset) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0, 10);
  };
  await WalkInvite.create([
    { from: created[1].user._id, to: me._id, match: m1._id, date: d(3), time: "10:00", place: "서울숲 입구", note: "제목: 주말 아침 산책 · 최대 2명", status: "confirmed" },
    { from: me._id, to: created[2].user._id, match: m2._id, date: d(6), time: "15:00", place: "한강공원 뚝섬", note: "제목: 대형견 함께 산책", status: "proposed" },
  ]);

  // walk records for my pet
  const myPet = created[0].pet._id;
  const past = (daysAgo, hour) => {
    const s = new Date();
    s.setDate(s.getDate() - daysAgo);
    s.setHours(hour, 0, 0, 0);
    return s;
  };
  await Walk.create([
    { owner: me._id, pet: myPet, distanceKm: 3.2, durationMin: 48, startedAt: past(6, 10), endedAt: past(6, 10), notes: "몽이와 한강 산책" },
    { owner: me._id, pet: myPet, distanceKm: 2.7, durationMin: 41, startedAt: past(9, 14), endedAt: past(9, 14), notes: "동네 한 바퀴" },
    { owner: me._id, pet: myPet, distanceKm: 4.1, durationMin: 62, startedAt: past(12, 9), endedAt: past(12, 9), notes: "서울숲 롱워크" },
  ]);

  console.log("\n=== DEMO ACCOUNTS (password is the same for all) ===");
  console.log(`PASSWORD: ${PASSWORD}\n`);
  created.forEach((c, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${c.email}   | ${c.name} · ${c.petName}`)
  );
  console.log(`\n로그인 추천 계정: demo1@petdate.app (매칭/채팅/산책약속/기록 데이터 포함)`);

  await mongoose.disconnect();
  console.log("\nDone. Disconnected.");
}

run().catch(async (e) => {
  console.error("Seed failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
