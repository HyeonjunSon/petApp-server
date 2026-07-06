// server/models/WebhookLog.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * WebhookLog — Stripe webhook idempotency + audit. Insert with stripeEventId
 * uniqueness so retries don't double-process. Keeps raw payload for forensics.
 */
const WebhookLogSchema = new Schema(
  {
    stripeEventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true }, // e.g. "customer.subscription.updated"
    payload: { type: Schema.Types.Mixed }, // raw event.data.object
    processedAt: { type: Date },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WebhookLog", WebhookLogSchema);
