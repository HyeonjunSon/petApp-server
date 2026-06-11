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
      enum: ["proposed", "confirmed", "declined", "cancelled"],
      default: "proposed",
      index: true,
    },
  },
  { timestamps: true }
);

WalkInviteSchema.index({ match: 1, createdAt: -1 });

module.exports = mongoose.model("WalkInvite", WalkInviteSchema);
