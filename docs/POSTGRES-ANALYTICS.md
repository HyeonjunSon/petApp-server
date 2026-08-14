# PostgreSQL 분석 스토어 (Prisma)

PetDate 백엔드는 **폴리글랏 저장소** 구성을 사용한다:

- **MongoDB (Mongoose)** — 운영 데이터의 원본 (users, pets, matches, chats, walk invites…)
- **PostgreSQL (Prisma)** — 매칭/산책 **이벤트 로그 + 분석 쿼리** 전용 (append-only)

관계형 집계(일별 추이, 전환율, `FILTER`/`date_trunc` 등)는 Postgres가 훨씬 자연스럽고,
운영 도큐먼트 스토어와 분석 워크로드를 분리하면 서로 영향을 주지 않는다 — 이 구성 자체가
포트폴리오 포인트다.

## 구성 요소

| 파일 | 역할 |
|---|---|
| `prisma/schema.prisma` | `swipe_events`, `walk_events` 테이블 (Mongo ObjectId는 문자열로 저장) |
| `config/analytics.js` | 로거. **fire-and-forget** — 분석 실패가 서비스 요청을 절대 깨뜨리지 않음. `DATABASE_URL` 없으면 전체 no-op, `NODE_ENV=test`에서도 기본 비활성 |
| `routes/matches-like.js` | 좋아요/패스마다 `SwipeEvent` 기록 (매치 성립 시 `matched=true`) |
| `routes/walk-invites.js` | 약속 생성(PROPOSED)과 모든 상태 전이를 `WalkEvent`로 기록 |
| `routes/analytics.js` | `GET /api/analytics/summary?days=14` — 누적/일별 지표 |

## 로컬 설정

```bash
# 1) Postgres 기동 (호스트 포트 5433 — 로컬 5432와 충돌 방지)
docker compose -f docker-compose.postgres.yml up -d

# 2) .env 에 연결 문자열 (이미 추가돼 있음)
# DATABASE_URL=postgresql://petdate:petdate@localhost:5433/petdate_analytics

# 3) 마이그레이션 + 클라이언트 생성
npm run prisma:migrate     # 개발용 (마이그레이션 생성/적용)
npm run prisma:generate    # 클라이언트만 재생성

# 4) 서버 실행 — 이후 like/pass/산책 상태 변경이 자동 적재됨
npm run dev
```

`DATABASE_URL`을 지우면 로깅·요약 API가 조용히 비활성화된다 (`GET /api/analytics/summary` → `{ "enabled": false }`).

## 요약 API 응답 예시

```json
{
  "enabled": true,
  "totals": { "swipes": 3, "likes": 2, "passes": 1, "matches": 1, "likeToMatchRate": 0.5 },
  "walks": { "proposed": 1, "confirmed": 1, "declined": 0, "cancelled": 0, "completed": 0 },
  "daily": [ { "day": "2026-08-14", "likes": 2, "passes": 1, "matches": 1 } ]
}
```

## 배포 (Heroku + Neon)

프로덕션 DB는 **Neon** (서버리스 Postgres, 무료 티어) — 프로젝트 `petdate-analytics`.

1. `neonctl connection-string --project-id <id>` 로 연결 문자열 확인
2. `heroku config:set DATABASE_URL="<neon url>" -a petwebapp`
3. `git push heroku main` — `Procfile`의 release 단계(`npx prisma migrate deploy`)가 자동으로 마이그레이션 적용
4. Neon 연결 문자열에는 `sslmode=require`가 이미 포함돼 있고, 없더라도 dyno에서는 코드가 자동으로 붙인다 (`config/analytics.js`)

## 운영 노트

- 로깅은 응답 경로에서 `await`하지 않는다. PG가 죽어도 앱 기능은 그대로, 콘솔에 `[analytics] … failed` 경고만 남는다.
- 테이블은 append-only 로그다. 스키마 변경은 `prisma migrate dev`로 새 마이그레이션을 만든다.
- 테스트(jest)는 mongodb-memory-server만 쓰고 Postgres는 건드리지 않는다 (필요하면 `ANALYTICS_IN_TEST=1`로 활성화).
