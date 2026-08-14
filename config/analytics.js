// config/analytics.js — PostgreSQL(Prisma) 분석 이벤트 로거.
//
// 원칙: 분석 저장 실패가 서비스 요청을 절대 깨뜨리지 않는다.
//  - DATABASE_URL이 없으면(로컬 미설정, 테스트) 전부 no-op.
//  - 로깅은 fire-and-forget: 호출부는 await하지 않고, 에러는 warn만 남긴다.

let prisma = null;

function isEnabled() {
  // jest(mongodb-memory-server) 실행이 로컬 분석 DB를 오염시키지 않도록
  // 테스트에서는 기본 비활성 (ANALYTICS_IN_TEST=1로 명시하면 허용).
  if (process.env.NODE_ENV === "test" && !process.env.ANALYTICS_IN_TEST) return false;
  return Boolean(process.env.DATABASE_URL);
}

// Heroku Postgres는 SSL이 필수(자체 서명 인증서)라서, dyno에서 URL에
// sslmode가 빠져 있으면 require를 붙여 준다. 로컬(docker)은 그대로.
function resolveUrl() {
  const url = process.env.DATABASE_URL || "";
  if (process.env.DYNO && url && !/[?&]sslmode=/.test(url)) {
    return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
  }
  return url;
}

function getPrisma() {
  if (!isEnabled()) return null;
  if (!prisma) {
    // require를 지연시켜 DATABASE_URL 없이도(client 미생성 상태 포함) 서버가 뜨게 한다.
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient({
      datasources: { db: { url: resolveUrl() } },
    });
  }
  return prisma;
}

function fireAndForget(promiseFactory, label) {
  const client = getPrisma();
  if (!client) return;
  Promise.resolve()
    .then(() => promiseFactory(client))
    .catch((e) => console.warn(`[analytics] ${label} failed:`, e.message));
}

/** 좋아요/패스 1건 기록. matched/matchId는 좋아요로 매치가 성립했을 때만. */
function logSwipe({ actorId, targetId, action, matched = false, matchId = null }) {
  fireAndForget(
    (client) =>
      client.swipeEvent.create({
        data: {
          actorId: String(actorId),
          targetId: String(targetId),
          action,
          matched,
          matchId: matchId ? String(matchId) : null,
        },
      }),
    "logSwipe"
  );
}

/** 산책 약속 상태 전이 기록 (생성=PROPOSED 포함). */
function logWalkEvent({ inviteId, matchId = null, actorId, status }) {
  fireAndForget(
    (client) =>
      client.walkEvent.create({
        data: {
          inviteId: String(inviteId),
          matchId: matchId ? String(matchId) : null,
          actorId: String(actorId),
          status,
        },
      }),
    "logWalkEvent"
  );
}

module.exports = { isEnabled, getPrisma, logSwipe, logWalkEvent };
