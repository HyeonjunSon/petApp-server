// server/routes/mapkit.js — Apple MapKit JS 토큰 발급.
// .p8 개인키(ES256)로 30분짜리 JWT를 서명해 내려준다. 프론트는
// mapkit.init({ authorizationCallback })에서 이 토큰을 받아 쓴다.
//
// 필요 env (없으면 501 → 프론트가 Leaflet으로 폴백):
//   MAPKIT_TEAM_ID     Apple Developer Team ID (멤버십 페이지에서 확인)
//   MAPKIT_KEY_ID      MapKit JS가 활성화된 Key의 ID
//   MAPKIT_PRIVATE_KEY .p8 파일 내용 (개행은 \n 이스케이프 가능)
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/requireAuth");

const ready = () =>
  !!(
    process.env.MAPKIT_TEAM_ID &&
    process.env.MAPKIT_KEY_ID &&
    process.env.MAPKIT_PRIVATE_KEY
  );

router.get("/token", requireAuth, (req, res, next) => {
  try {
    if (!ready()) {
      return res.status(501).json({ enabled: false, msg: "MapKit is not configured." });
    }
    const privateKey = process.env.MAPKIT_PRIVATE_KEY.replace(/\\n/g, "\n");
    const payload = {};
    // Origin 클레임: 요청 Origin이 있으면 그 도메인으로 토큰을 묶는다 (CORS가 이미 검증)
    if (req.headers.origin) payload.origin = req.headers.origin;
    const token = jwt.sign(payload, privateKey, {
      algorithm: "ES256",
      issuer: process.env.MAPKIT_TEAM_ID,
      expiresIn: "30m",
      header: { kid: process.env.MAPKIT_KEY_ID, typ: "JWT" },
    });
    res.json({ enabled: true, token });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
