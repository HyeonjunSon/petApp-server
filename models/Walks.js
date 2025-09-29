// server/models/Walk.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const RoutePointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    t:   { type: Date,   default: Date.now },
  },
  { _id: false }
);

const WalkSchema = new Schema(
  {
    // ✅ 인증 사용자
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // ✅ 어떤 반려동물의 산책인지
    pet:   { type: Schema.Types.ObjectId, ref: "Pet", required: true },

    // ✅ 거리/시간: 기본값 0, 0 미만 금지
    distanceKm: { type: Number, default: 0, min: 0 },
    durationMin:{ type: Number, default: 0, min: 0 },

    // ✅ 시작/종료 시각: 종료는 선택
    startedAt: { type: Date, required: true },
    endedAt:   { type: Date }, // ← required 제거

    // 메모 & 경로
    notes: { type: String, default: "" },
    route: { type: [RoutePointSchema], default: [] },
  },
  { timestamps: true }
);

// ✅ endedAt 유효성(있다면 startedAt 이후)
WalkSchema.path("endedAt").validate(function (value) {
  if (!value) return true;
  return this.startedAt && value >= this.startedAt;
}, "endedAt must be equal to or after startedAt");

// ✅ 조회 최적화 인덱스
WalkSchema.index({ owner: 1, startedAt: -1 });
WalkSchema.index({ pet: 1, startedAt: -1 });

module.exports = mongoose.model("Walk", WalkSchema);
