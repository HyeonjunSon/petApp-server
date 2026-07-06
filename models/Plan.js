// server/models/Plan.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Plan — catalog of subscription tiers exposed via GET /api/billing/plans.
 * The actual Stripe price object id lives in `stripePriceId`; everything else
 * is presentation data so the front-end paywall can render without touching Stripe.
 */
const PlanSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // e.g. "premium_monthly"
    label: { type: String, required: true }, // display name
    description: { type: String, default: "" },
    priceCents: { type: Number, required: true, min: 0 }, // for display only
    currency: { type: String, default: "USD" },
    interval: { type: String, enum: ["month", "year"], default: "month" },
    features: { type: [String], default: [] }, // unlock keys; see Entitlement.feature
    stripePriceId: { type: String, default: "" }, // Stripe price_xxx (set once you have keys)
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", PlanSchema);
