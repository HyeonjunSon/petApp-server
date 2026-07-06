// server/models/DailySteps.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const DailyStepsSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD (user local)
    steps: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["ios", "android", "manual"], default: "manual" },
  },
  { timestamps: true }
);

DailyStepsSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailySteps", DailyStepsSchema);
