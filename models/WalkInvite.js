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
