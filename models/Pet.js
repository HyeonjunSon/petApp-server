// server/models/Pet.js
const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const PetSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, // ← 추가
    name:  { type: String, required: true, trim: true },
    type:  { type: String, required: true, trim: true, lowercase: true },
    age:   { type: Number },
    bio:   { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pet", PetSchema);
