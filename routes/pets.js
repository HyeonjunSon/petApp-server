// server/routes/pets.js
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const Pet = require("../models/Pet");
const { isValidObjectId } = require("mongoose");

// [POST] /api/pets
router.post("/", requireAuth, async (req, res) => {
  try {
    let { name, type, species, age, bio } = req.body || {};

    // species로 온 경우도 허용 → type으로 매핑
    if (!type && species) type = species;

    if (!name || !type) {
      return res
        .status(400)
        .json({ message: "name, type 필수 (type=dog|cat 등)" });
    }

    const pet = await Pet.create({
      owner: req.user._id,
      name: String(name).trim(),
      type: String(type).trim().toLowerCase(),
      age:
        age === undefined || age === null || age === ""
          ? undefined
          : Number(age),
      bio: bio ? String(bio).trim() : "",
      // 필요 시 소유자 필드가 있다면 여기 추가: owner/user 중 스키마에 맞춰 사용
      // owner: req.user._id  또는  user: req.user._id
    });

    return res.status(201).json(pet);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to create pet" });
  }
});

// [GET] /api/pets
router.get("/", requireAuth, async (req, res) => {
  const list = await Pet.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .lean();
  return res.json(list);
});

// [DELETE] /api/pets/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "잘못된 id 형식입니다." });
    }

    // ⚠️ Pet 스키마에 소유자 필드가 있으면 조건 같이 걸어주세요.
    // const deleted = await Pet.findOneAndDelete({ _id: id, owner: req.user._id }); // owner 쓰는 경우
    // const deleted = await Pet.findOneAndDelete({ _id: id, user:  req.user._id }); // user  쓰는 경우
    const deleted = await Pet.findByIdAndDelete({
      _id: id,
      owner: req.user._id,
    }); // 소유자 필드가 없을 때

    if (!deleted) {
      return res
        .status(404)
        .json({ message: "대상을 찾을 수 없거나 권한이 없습니다." });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to delete pet" });
  }
});

module.exports = router;
