// server/models/User.js
const mongoose = require("mongoose");

const PhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    type: { type: String, enum: ["owner_face", "pet", "other"], default: "other" },
  },
  { _id: false } // 굳이 서브도큐먼트 _id가 필요 없으면 옵션으로 끌 수 있어요
);

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, index: true, required: true },
  passwordHash: { type: String, required: true },
  name: String,
  phone: String,
  birthYear: Number,
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  locationName: { type: String, default: "" },
  about: String,
  photos: [PhotoSchema],
  pets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pet" }],
  verified: { type: Boolean, default: false },
  roles: [String],
  goal: String,
  interests: [String],
  settings: {
    maxDistance: { type: Number, default: 10 },
    ageRange: { type: [Number], default: [20, 40] },
    species: { type: String, enum: ["all", "dog", "cat"], default: "all" },
    discoverable: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
  },
  pushTokens: { type: [String], default: [] }, // Expo push tokens (multi-device)
  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ location: "2dsphere" });

// virtual 직렬화 켜기
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// 역참조 virtual: Pet.owner -> User._id
UserSchema.virtual('ownedPets', {
  ref: 'Pet',
  localField: '_id',
  foreignField: 'owner',
  justOne: false,
});

module.exports = mongoose.model("User", UserSchema);
