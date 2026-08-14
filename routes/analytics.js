// routes/analytics.js — Postgres(Prisma) 기반 매칭/산책 분석 요약.
// 마운트: app.use("/api/analytics", ...) → GET /api/analytics/summary
const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const { isEnabled, getPrisma } = require("../config/analytics");

router.use(requireAuth);

// GET /api/analytics/summary?days=14
router.get("/summary", async (req, res, next) => {
  try {
    if (!isEnabled()) {
      // Postgres 미설정 환경(로컬 기본, 테스트)에서도 200으로 응답해
      // 프론트가 기능 유무를 분기할 수 있게 한다.
      return res.json({ enabled: false });
    }
    const prisma = getPrisma();
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [swipes, likes, matches, walkCounts, daily] = await Promise.all([
      prisma.swipeEvent.count(),
      prisma.swipeEvent.count({ where: { action: "LIKE" } }),
      prisma.swipeEvent.count({ where: { matched: true } }),
      prisma.walkEvent.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.$queryRaw`
        SELECT date_trunc('day', "createdAt")::date AS day,
               count(*) FILTER (WHERE action = 'LIKE')  AS likes,
               count(*) FILTER (WHERE action = 'PASS')  AS passes,
               count(*) FILTER (WHERE matched)          AS matches
        FROM swipe_events
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
    ]);

    const walks = Object.fromEntries(
      walkCounts.map((w) => [w.status.toLowerCase(), w._count._all])
    );

    res.json({
      enabled: true,
      totals: {
        swipes,
        likes,
        passes: swipes - likes,
        matches,
        likeToMatchRate: likes ? +(matches / likes).toFixed(4) : 0,
      },
      walks: {
        proposed: walks.proposed || 0,
        confirmed: walks.confirmed || 0,
        declined: walks.declined || 0,
        cancelled: walks.cancelled || 0,
        completed: walks.completed || 0,
      },
      daily: daily.map((d) => ({
        day: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : String(d.day),
        likes: Number(d.likes),
        passes: Number(d.passes),
        matches: Number(d.matches),
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
