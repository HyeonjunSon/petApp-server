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
  { name: "김서준", gender: "male", region: "서울 마포구", birthYear: 1994, goal: "both",
    about: "주말마다 한강에서 러닝하고 산책해요. 활발한 강아지 환영!",
    interests: ["러닝", "카페", "캠핑"],
    pet: { name: "초코", breed: "포메라니안", age: 3, sex: "male", size: "s",
      temperament: ["Energetic", "Friendly"],
      about: "에너지 넘치는 포메라니안이에요. 같이 뛰어놀 친구를 찾아요!" },
    photos: [ceo("pomeranian/rafi_with_glasses.jpg"), ceo("pomeranian/pom-sophie-2.jpg"), ceo("pomeranian/pomeranian_black_01.jpg")] },
  { name: "이지우", gender: "female", region: "서울 강남구", birthYear: 1996, goal: "friends",
    about: "조용한 동네 산책을 좋아해요. 저녁에 여유롭게 걸을 친구를 찾아요.",
    interests: ["요가", "베이킹"],
    pet: { name: "몽이", breed: "말티즈", age: 2, sex: "female", size: "s",
      temperament: ["Gentle", "Shy"],
      about: "처음엔 수줍지만 친해지면 애교쟁이예요." },
    photos: [ceo("maltese/n20201012_img_0437.jpg"), ceo("maltese/n02085936_2465.jpg"), ceo("maltese/n02085936_8507.jpg")] },
  { name: "박민준", gender: "male", region: "서울 성동구", birthYear: 1992, goal: "dating",
    about: "서울숲에 골든이랑 자주 나가요. 대형견 친구 환영합니다.",
    interests: ["등산", "사진", "맥주"],
    pet: { name: "맥스", breed: "골든리트리버", age: 3, sex: "male", size: "l",
      temperament: ["Energetic", "Friendly"],
      about: "사람을 정말 좋아하는 골든이에요. 하루 두 번 산책은 기본!" },
    photos: [ceo("retriever-golden/nina.jpg"), ceo("retriever-golden/mori_4.jpg"), ceo("retriever-golden/joey_img_0261.jpg")] },
  { name: "최수아", gender: "female", region: "서울 송파구", birthYear: 1998, goal: "both",
    about: "카페 투어와 강아지 산책이 취미예요.",
    interests: ["카페", "드로잉"],
    pet: { name: "두부", breed: "비숑프리제", age: 4, sex: "male", size: "s",
      temperament: ["Gentle", "Friendly"],
      about: "구름 같은 비숑이에요. 사교성이 좋아 친구가 많아요." },
    photos: [ceo("frise-bichon/h-1.jpg"), ceo("frise-bichon/h-2.jpg"), ceo("frise-bichon/4.jpg")] },
  { name: "정하늘", gender: "male", region: "서울 은평구", birthYear: 1995, goal: "friends",
    about: "매일 아침 시바랑 산책해요. 아침 산책 메이트 구합니다.",
    interests: ["러닝", "커피"],
    pet: { name: "하루", breed: "시바견", age: 5, sex: "male", size: "m",
      temperament: ["Independent", "Energetic"],
      about: "도도하지만 산책은 진심인 시바견이에요." },
    photos: [ceo("shiba/shiba-16.jpg"), ceo("shiba/shiba-9.jpg"), ceo("shiba/shiba_20.jpg")] },
  { name: "강예은", gender: "female", region: "서울 서초구", birthYear: 1997, goal: "dating",
    about: "코기 궁둥이 담당입니다. 공원 산책을 좋아해요.",
    interests: ["여행", "베이킹", "영화"],
    pet: { name: "보리", breed: "웰시코기", age: 2, sex: "female", size: "m",
      temperament: ["Energetic", "Friendly"],
      about: "짧은 다리로 열심히 걷는 코기예요!" },
    photos: [ceo("corgi/img_3428.jpg"), ceo("corgi/13263927_10154125975153449_6587119903523649180_n.jpg"), ceo("corgi/14917192_10154550690893449_81787730512372227_o.jpg")] },
  { name: "윤도현", gender: "male", region: "서울 용산구", birthYear: 1993, goal: "both",
    about: "비글이라 에너지가 넘쳐요. 장거리 산책 좋아합니다.",
    interests: ["등산", "자전거"],
    pet: { name: "콩이", breed: "비글", age: 3, sex: "male", size: "m",
      temperament: ["Energetic", "Shy"],
      about: "세상에서 킁킁거리는 게 제일 좋은 비글이에요." },
    photos: [ceo("beagle/phoebe.jpg"), ceo("beagle/barnaby_2.jpg"), ceo("beagle/1374053345_milo.jpg")] },
  { name: "임채원", gender: "female", region: "서울 종로구", birthYear: 1999, goal: "friends",
    about: "주로 저녁에 산책해요. 소형견 친구 환영이에요!",
    interests: ["독서", "카페"],
    pet: { name: "루나", breed: "포메라니안", age: 1, sex: "female", size: "s",
      temperament: ["Energetic", "Friendly"],
      about: "아직 아기라 호기심이 넘쳐요." },
    photos: [ceo("pomeranian/pomeranian_black_006.jpg"), ceo("pomeranian/pomeranian_black_05.jpg"), ceo("pomeranian/pomeranian_black_08.jpg")] },
  { name: "한지호", gender: "male", region: "서울 광진구", birthYear: 1991, goal: "dating",
    about: "어린이대공원에서 진돗개랑 자주 걸어요.",
    interests: ["헬스", "요리"],
    pet: { name: "뭉치", breed: "진돗개", age: 6, sex: "male", size: "l",
      temperament: ["Gentle", "Independent"],
      about: "듬직하고 차분한 진돗개예요." },
    photos: [wiki("1/18/Korea_Jindo_Dog.jpg"), wiki("8/8e/Jindo_dog_face.jpg"), wiki("thumb/7/77/Jindo_wiki.jpg/960px-Jindo_wiki.jpg")] },
  { name: "오서연", gender: "female", region: "서울 동작구", birthYear: 2000, goal: "both",
    about: "시츄랑 동네 한 바퀴 천천히 걷는 걸 좋아해요.",
    interests: ["드로잉", "산책", "카페"],
    pet: { name: "코코", breed: "시츄", age: 4, sex: "female", size: "s",
      temperament: ["Gentle", "Friendly"],
      about: "느긋하고 애교 많은 시츄예요." },
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

  const m1 = await mkMatch(me, created[1].user); // 몽이 · 이지우
  const m2 = await mkMatch(me, created[2].user); // 맥스 · 박민준
  const m3 = await mkMatch(me, created[3].user); // 두부 · 최수아

  // conversation in m1
  const msgs = await Message.create([
    { match: m1._id, from: created[1].user._id, text: "안녕하세요! 초코랑 몽이 산책 잘 맞을 것 같아요 😊", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "좋아요! 초코도 활발한 편이에요 🐶", seenBy: [me._id, created[1].user._id] },
    { match: m1._id, from: created[1].user._id, text: "이번 주말에 한강공원 어때요?", seenBy: [me._id] },
    { match: m1._id, from: me._id, text: "좋아요! 토요일 오후에 시간 되세요?", seenBy: [me._id] },
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
    { from: created[1].user._id, to: me._id, match: m1._id, date: d(3), time: "10:00", place: "서울숲 정문 앞", note: "제목: 주말 아침 산책 · 최대 2팀", status: "confirmed" },
    { from: me._id, to: created[2].user._id, match: m2._id, date: d(6), time: "15:00", place: "뚝섬 한강공원", note: "제목: 대형견 같이 걷기", status: "proposed" },
  ]);

  // one COMPLETED past plan → auto-created walk records (one per participant)
  const started = past(4, 9);
  const myWalk = await Walk.create({ owner: me._id, pet: myPet, distanceKm: 2.9, durationMin: 45, startedAt: started, endedAt: started, notes: "올림픽공원" });
  const peerWalk = await Walk.create({ owner: created[3].user._id, pet: created[3].pet._id, distanceKm: 2.9, durationMin: 45, startedAt: started, endedAt: started, notes: "올림픽공원" });
  await WalkInvite.create({
    from: me._id, to: created[3].user._id, match: m3._id, date: d(-4), time: "09:00",
    place: "올림픽공원", note: "제목: 아침 모임", status: "completed",
    completedAt: new Date(), distanceKm: 2.9, durationMin: 45, linkedWalks: [myWalk._id, peerWalk._id],
  });

  // a couple of older records for my pet
  await Walk.create([
    { owner: me._id, pet: myPet, distanceKm: 3.2, durationMin: 48, startedAt: past(9, 10), endedAt: past(9, 10), notes: "한강 산책" },
    { owner: me._id, pet: myPet, distanceKm: 4.1, durationMin: 62, startedAt: past(12, 9), endedAt: past(12, 9), notes: "서울숲 롱워크" },
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
