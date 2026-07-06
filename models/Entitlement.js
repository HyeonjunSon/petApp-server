// server/models/Entitlement.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Entitlement — per-feature unlocks. Granted by subscription or admin override.
 * Used by gating middleware (e.g. require 'discover_premium' before /api/discover/boost).
 */
const EntitlementSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    feature: { type: String, required: true, index: true }, // e.g. "unlimited_swipes", "see_likes", "boost"
    source: { type: String, enum: ["subscription", "admin"], default: "subscription" },
    sourceRef: { type: Schema.Types.ObjectId }, // Subscription._id when source=subscription
    expiresAt: { type: Date }, // null = no expiry; otherwise gate checks Date.now()
  },
  { timestamps: true }
);

EntitlementSchema.index({ user: 1, feature: 1 }, { unique: true });

EntitlementSchema.statics.hasFeature = async function (userId, feature) {
  const row = await this.findOne({ user: userId, feature });
  if (!row) return false;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
  return true;
};

module.exports = mongoose.model("Entitlement", EntitlementSchema);
