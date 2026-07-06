// server/models/Subscription.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Subscription — one row per Stripe subscription per user.
 * Webhook handler keeps `status` and `currentPeriodEnd` in sync.
 */
const SubscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    stripeCustomerId: { type: String, default: "" },
    stripeSubscriptionId: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
      default: "incomplete",
      index: true,
    },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Quick "is the user a paying member right now?" check.
SubscriptionSchema.statics.activeForUser = function (userId) {
  return this.findOne({
    user: userId,
    status: { $in: ["trialing", "active"] },
  });
};

module.exports = mongoose.model("Subscription", SubscriptionSchema);
