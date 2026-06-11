// server/models/Pass.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const PassSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetId: { type: String, required: true, index: true }, // 패스(넘긴) 대상 사용자 id
  },
  { timestamps: true }
);

PassSchema.index({ owner: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model("Pass", PassSchema);
