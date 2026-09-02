// server/models/WalkInvite.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const WalkInviteSchema = new Schema(
  {
    from: { type: Types.ObjectId, ref: "User", required: true, index: true },
    to:   { type: Types.ObjectId, ref: "User", required: true, index: true },
    match: { type: Types.ObjectId, ref: "Match", required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // HH:mm
    place: { type: String, default: "" },
    // 만날 장소 좌표 (지도 픽커에서 선택, 선택 사항)
    meetPoint: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    note:  { type: String, default: "" },
    status: {
      type: String,
      enum: ["proposed", "confirmed", "declined", "cancelled", "completed"],
      default: "proposed",
      index: true,
    },
    // Filled in when a confirmed walk is marked completed.
    completedAt: { type: Date },
    // Walk records auto-created on completion (one per participant with a pet).
    linkedWalks: [{ type: Types.ObjectId, ref: "Walk" }],
    distanceKm: { type: Number, default: 0 },
    durationMin: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WalkInviteSchema.index({ match: 1, createdAt: -1 });

module.exports = mongoose.model("WalkInvite", WalkInviteSchema);
