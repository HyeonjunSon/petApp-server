// server/models/Message.js
const { Schema, model, Types } = require("mongoose");

const MessageSchema = new Schema(
  {
    match: { type: Types.ObjectId, ref: "Match", index: true, required: true },
    from: { type: Types.ObjectId, ref: "User", index: true, required: true },
    text: { type: String, trim: true },

    attachments: [
      {
        kind: { type: String, enum: ["image", "file"], default: "file" },
        url: String,
        name: String,
        size: Number,
      },
    ],

    seenBy: { type: [Types.ObjectId], ref: "User", index: true, default: [] },
  },
  { timestamps: true }
);

// 최신 메시지 조회용
MessageSchema.index({ match: 1, createdAt: -1 });

// 편의 스태틱: 여러 메시지를 '읽음' 처리
MessageSchema.statics.markSeen = function ({ messageIds, userId }) {
  return this.updateMany(
    { _id: { $in: messageIds } },
    { $addToSet: { seenBy: userId } }
  );
};

module.exports = model("Message", MessageSchema);
