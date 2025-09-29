const mongoose = require("mongoose");
const { Schema } = mongoose;

const PhotoSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true }, // e.g. /uploads/xxx.jpg
    type: {
      type: String,
      enum: ["owner_face", "pet", "other"], // 사진 종류 구분
      default: "other",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Photo", PhotoSchema);
