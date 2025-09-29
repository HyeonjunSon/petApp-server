// server/models/Match.js
const { Schema, model, Types } = require("mongoose");

const MatchSchema = new Schema(
  {
    users: [{ type: Types.ObjectId, ref: "User", required: true }],
    lastMessage: { type: Types.ObjectId, ref: "Message" },

    // 👇 선택(문자 문자열 방코드 매핑용)
    roomId: { type: String, index: true, unique: true, sparse: true },
  },
  { timestamps: true }
);

MatchSchema.index({ users: 1 });

module.exports = model("Match", MatchSchema);
