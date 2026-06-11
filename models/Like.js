// server/models/Like.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const LikeSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetId: { type: String, required: true, index: true }, // 좋아요(관심) 보낸 대상 사용자 id
  },
  { timestamps: true }
);

LikeSchema.index({ owner: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model("Like", LikeSchema);
