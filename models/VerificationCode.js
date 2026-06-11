// server/models/VerificationCode.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const VerificationCodeSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: ["verify_email", "reset_password"],
      required: true,
    },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false }, // 코드 확인 성공 표시
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// 한 (email, purpose) 당 한 건만 유지
VerificationCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
// TTL: expiresAt 지나면 자동 삭제
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("VerificationCode", VerificationCodeSchema);
