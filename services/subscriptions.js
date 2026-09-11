// server/services/subscriptions.js
//
// 구독 상태 → 기능 권한(Entitlement) 반영을 한 곳에서 처리한다.
// 데모 체크아웃과 Stripe 웹훅이 **같은 함수**를 호출하므로, 결제 수단이
// 무엇이든 권한 규칙은 하나뿐이다.

const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const Entitlement = require("../models/Entitlement");

const ACTIVE_STATUSES = ["active", "trialing"];
const DEFAULT_FEATURES = ["unlimited_swipes", "see_likes"];

/**
 * 구독을 upsert하고 권한을 맞춘다.
 *  - 활성(active/trialing): 플랜의 feature를 부여. 해지 예약이면 기간 만료일에 종료되도록 expiresAt 설정.
 *  - 비활성(canceled/unpaid/past_due…): 이 구독이 부여했던 권한을 즉시 만료.
 */
async function syncSubscription({
  userId,
  plan, // Plan 도큐먼트 또는 _id
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
  stripeCustomerId,
  stripeSubscriptionId,
}) {
  const planDoc =
    plan && plan.features ? plan : plan ? await Plan.findById(plan).lean() : null;

  const set = { status };
  if (planDoc?._id) set.plan = planDoc._id;
  if (currentPeriodEnd !== undefined) set.currentPeriodEnd = currentPeriodEnd;
  if (cancelAtPeriodEnd !== undefined) set.cancelAtPeriodEnd = cancelAtPeriodEnd;
  if (stripeCustomerId) set.stripeCustomerId = stripeCustomerId;
  if (stripeSubscriptionId) set.stripeSubscriptionId = stripeSubscriptionId;

  const query = stripeSubscriptionId
    ? { $or: [{ stripeSubscriptionId }, { user: userId }] }
    : { user: userId };

  const sub = await Subscription.findOneAndUpdate(
    query,
    { $set: set, $setOnInsert: { user: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const features = planDoc?.features?.length ? planDoc.features : DEFAULT_FEATURES;

  if (ACTIVE_STATUSES.includes(status)) {
    // 해지 예약이면 기간 만료일까지만 유효하게, 아니면 무기한(null)
    const expiresAt = cancelAtPeriodEnd ? sub.currentPeriodEnd || new Date() : null;
    await Promise.all(
      features.map((feature) =>
        Entitlement.updateOne(
          { user: userId, feature },
          { $set: { source: "subscription", sourceRef: sub._id, expiresAt } },
          { upsert: true }
        )
      )
    );
  } else {
    // 구독이 끝났다 → 이 구독이 준 권한만 즉시 만료 (admin 부여분은 건드리지 않음)
    await Entitlement.updateMany(
      { user: userId, sourceRef: sub._id },
      { $set: { expiresAt: new Date() } }
    );
  }

  return sub;
}

module.exports = { syncSubscription, ACTIVE_STATUSES, DEFAULT_FEATURES };
