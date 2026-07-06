// server/middleware/requireEntitlement.js
//
// Express middleware factory: blocks the request unless the authenticated
// user has the given feature flag in their Entitlement records. Returns
// 402 Payment Required with { feature, msg } so the client can redirect
// to the paywall.
//
// Usage:
//   const requireAuth = require("../middleware/requireAuth");
//   const requireEntitlement = require("../middleware/requireEntitlement");
//   router.get("/likes-received", requireAuth, requireEntitlement("see_likes"), handler);

const Entitlement = require("../models/Entitlement");

function requireEntitlement(feature) {
  if (!feature) throw new Error("requireEntitlement: feature is required");
  return async (req, res, next) => {
    try {
      const userId = req.userId || req.user?._id;
      if (!userId) return res.status(401).json({ msg: "Not authenticated" });
      const ok = await Entitlement.hasFeature(userId, feature);
      if (!ok) {
        return res
          .status(402)
          .json({ feature, msg: `Subscription required: ${feature}` });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = requireEntitlement;
