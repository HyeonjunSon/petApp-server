// server/models/Pet.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const PetPhotoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
  },
  { _id: true, timestamps: true }
);

const TYPES = ["dog", "cat", "other"];
const SEX = ["male", "female", "unknown"];
const SIZE = ["s", "m", "l"];

const PetSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name:  { type: String, required: true, trim: true, maxlength: 24 },

    // canonical species field
    type:  { type: String, enum: TYPES, default: "other", lowercase: true, trim: true },

    breed: { type: String, trim: true, maxlength: 32, default: "" },
    age:   { type: Number, min: 0, max: 60 },
    sex:   { type: String, enum: SEX, default: "unknown" },
    size:  { type: String, enum: SIZE, default: "m" },
    temperament: {
      type: [String],
      default: [],
      validate: [(v) => v.length <= 5, "temperament max 5"],
    },

    // `about` is canonical. `bio` kept for backward compat and auto-synced.
    about: { type: String, default: "", maxlength: 200 },
    bio:   { type: String, default: "", maxlength: 200 },

    photos: { type: [PetPhotoSchema], default: [] },
  },
  { timestamps: true }
);

PetSchema.pre("save", function (next) {
  if (this.isModified("about") && !this.isModified("bio")) this.bio = this.about;
  else if (this.isModified("bio") && !this.isModified("about")) this.about = this.bio;
  next();
});

PetSchema.statics.TYPES = TYPES;
PetSchema.statics.SEX = SEX;
PetSchema.statics.SIZE = SIZE;

module.exports = mongoose.model("Pet", PetSchema);
