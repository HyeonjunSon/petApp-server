// server/models/Report.js
const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    targetId: { type: String, required: true, index: true },
    category: { type: String, default: "기타" },
    reason: { type: String, required: true },
    evidenceUrls: [{ type: String }],
    status: { type: String, enum: ["received", "reviewing", "resolved"], default: "received", index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", ReportSchema);
