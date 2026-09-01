// server/models/Post.js — 동네 피드 포스트 (Offleash blueprint §5)
const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: {
    type: String,
    enum: ["walk-request", "lost", "recommend", "question"],
    default: "question",
  },
  body: { type: String, required: true, maxlength: 2000 },
  // 작성 시점의 작성자 위치 스냅샷 (없으면 거리 표시 생략)
  location: {
    type: { type: String, enum: ["Point"], default: undefined },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },
  locationName: { type: String, default: "" },
  reactions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  comments: { type: [CommentSchema], default: [] },
  createdAt: { type: Date, default: Date.now, index: true },
});

PostSchema.index({ createdAt: -1 });
PostSchema.index({ location: "2dsphere" }, { sparse: true });

module.exports = mongoose.model("Post", PostSchema);
