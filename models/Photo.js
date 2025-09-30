const mongoose = require("mongoose");
const { Schema } = mongoose;

const PhotoSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: { type: String, required: true },
    fileName: {
      type: String,
      required: false,
      default: function () {
        if (this.originalName) return this.originalName;
        try {
          return new URL(this.url).pathname.split("/").pop();
        } catch {
          return undefined;
        }
      },
    },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
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
