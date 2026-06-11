// server/routes/walks.js
const express = require("express");
const { isValidObjectId } = require("mongoose");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
// ✅ 모델 파일명은 단수 Walk.js 기준
const Walk = require("../models/Walks");
const Pet  = require("../models/Pet");

// 날짜 파서 유틸
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * [GET] /api/walks?from&to&petId
 * - 인증 필수
 * - 본인(user) 데이터만 조회
 * - petId / 날짜 범위 필터 지원
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { from, to, petId } = req.query;

    const q = { owner: req.user._id };

    if (petId) {
      if (!isValidObjectId(petId)) {
        return res.status(400).json({ message: "Invalid owner format." });
      }
      q.pet = petId;
    }

    const fromDate = parseDate(from);
    const toDate   = parseDate(to);
    if (from && !fromDate) return res.status(400).json({ message: "Invalid 'from' date format." });
    if (to && !toDate)     return res.status(400).json({ message: "Invalid 'to' date format." });

    if (fromDate || toDate) {
      q.startedAt = {};
      if (fromDate) q.startedAt.$gte = fromDate;
      if (toDate)   q.startedAt.$lte = toDate;
    }

    const walks = await Walk.find(q)
      .sort({ startedAt: -1 })
      .populate("pet", "name breed");

    res.json(walks);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to load walks" });
  }
});

/**
 * [POST] /api/walks
 * body: { petId, distanceKm, durationMin, startedAt, endedAt?, notes?, route? }
 * - 인증 필수
 * - 본인(user)으로 저장
 * - petId 형식/존재 확인, 날짜/숫자 검증
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      petId,
      distanceKm = 0,
      durationMin = 0,
      startedAt,
      endedAt,
      notes = "",
      route = [],
    } = req.body;

    if (!isValidObjectId(petId)) {
      return res.status(400).json({ message: "Invalid petId format." });
    }

    const pet = await Pet.findById(petId).lean();
    if (!pet) return res.status(400).json({ message: "Pet not found." });

    const sAt = startedAt ? parseDate(startedAt) : new Date();
    if (!sAt) return res.status(400).json({ message: "Invalid startedAt date format." });

    let eAt = null;
    if (endedAt) {
      eAt = parseDate(endedAt);
      if (!eAt) return res.status(400).json({ message: "Invalid endedAt date format." });
      if (eAt < sAt) return res.status(400).json({ message: "endedAt must be after startedAt." });
    }

    const dist = Math.max(0, Number(distanceKm) || 0);
    const dur  = Math.max(0, Number(durationMin) || 0);

    const walk = await Walk.create({
      owner: req.user._id,   // ✅ 본인으로 저장
      pet: petId,
      distanceKm: dist,
      durationMin: dur,
      startedAt: sAt,
      endedAt: eAt,
      notes: typeof notes === "string" ? notes : "",
      route: Array.isArray(route) ? route : [],
    });

    res.status(201).json(walk);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to create walk" });
  }
});

/**
 * [DELETE] /api/walks/:id
 * - 인증 필수
 * - 본인(user)의 기록만 삭제
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id format." });
    }

    const deleted = await Walk.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!deleted) {
      return res.status(404).json({ message: "Record not found or permission denied." });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to delete walk" });
  }
});

module.exports = router;
