// server/models/Block.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const BlockSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetId: { type: String, required: true, index: true }, // 차단 대상 사용자 id
  },
  { timestamps: true }
);

BlockSchema.index({ owner: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model("Block", BlockSchema);
