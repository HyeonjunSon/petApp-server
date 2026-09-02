# Offleash API

[![CI](https://github.com/HyeonjunSon/petApp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/HyeonjunSon/petApp-server/actions/workflows/ci.yml)

Express + MongoDB + PostgreSQL backend for [Offleash](https://github.com/HyeonjunSon/petApp-frontend),
a neighbourhood community for dog owners. Live at `https://petwebapp-*.herokuapp.com/api`
behind the [web frontend](https://pet-app-frontend-fawn.vercel.app).

## Architecture — polyglot persistence

```
                ┌──────────────────────────────┐
   clients ───▶ │  Express 5  ·  Socket.IO     │
                │  JWT auth · entitlement gates│
                └──────────┬───────────┬───────┘
                           │           │ fire-and-forget events
                ┌──────────▼─────┐ ┌───▼──────────────────┐
                │ MongoDB Atlas  │ │ PostgreSQL (Neon)    │
                │ Mongoose 8     │ │ Prisma 6             │
                │ operational    │ │ append-only analytics│
                │ store (15      │ │ swipe_events ·       │
                │ models)        │ │ walk_events          │
                └────────────────┘ └──────────────────────┘
```

- **MongoDB** is the operational store: users (2dsphere-indexed locations), pets, likes,
  matches, messages, posts, walk invites/records, blocks, reports, plans/subscriptions/entitlements.
- **PostgreSQL** is a separate analytics store: every like/pass and walk-status transition is
  logged append-only and aggregated by `GET /api/analytics/summary` (like→match conversion,
  walk funnel, daily series via `date_trunc` + `FILTER`). Logging is fire-and-forget — an
  analytics outage can never break a request — and disables itself without `DATABASE_URL`.
  Details: [`docs/POSTGRES-ANALYTICS.md`](docs/POSTGRES-ANALYTICS.md).

## Features

| Area | Endpoints (all under `/api`) |
|---|---|
| Auth | email verification codes → register/login/reset (JWT) |
| Feed | `GET/POST /posts`, paw reactions, comments — block-aware, distance from author's coords |
| Discover | `GET /discover` — `$near`-sorted candidates with real `distanceM`, exclusion of blocks/passes/matches |
| Matching | like/pass with a daily free limit (402 → paywall), mutual like → match, `GET /matches/likes-me` (premium-gated: free users get `{locked, count}`) |
| Chat | Socket.IO rooms, delivery acks, read receipts, REST history |
| Walks | invite lifecycle (proposed→confirmed→completed) with optional map `meetPoint` (GeoJSON); completing a walk auto-creates records for both owners |
| Billing | plan catalog, checkout, cancel — **demo mode** activates instantly and grants entitlements (`unlimited_swipes`, `see_likes`); Stripe edges are isolated behind `STRIPE_SECRET_KEY` TODOs, same data layer |
| Safety | blocks (bidirectional filtering everywhere), reports |
| Media | Cloudinary uploads (owner/pet photos) |

## Getting started

```bash
npm install
cp .env.example .env   # or set MONGODB_URI, JWT_SECRET (see below)
npm run dev            # :5050

# optional — Postgres analytics
docker compose -f docker-compose.postgres.yml up -d
npm run prisma:migrate

# demo data: 10 users with breed-matched photos, matches, chats, walk plans, feed posts
node scripts/seed-demo.js
```

**Env:** `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGINS`, Cloudinary + SMTP creds,
`DATABASE_URL` (optional, enables analytics), `STRIPE_SECRET_KEY` (optional, future).

## Tests

```bash
npm test   # 9 suites / 34 tests — auth, discover, likes gate, blocks, posts,
           # premium lifecycle (checkout → entitlements → cancel), billing, messaging
```

Jest + supertest against `mongodb-memory-server`; analytics logging is automatically
disabled under test so suites never touch Postgres.

## Deploy

- **Heroku** (`Procfile`): release phase runs `prisma migrate deploy`, so schema changes
  ship with the dyno.
- **Neon** serverless Postgres in production (`DATABASE_URL`); SSL is enforced on dynos.
- Demo accounts for reviewers: `demo1@petdate.app` … `demo10@petdate.app` / `Petdate123!`
  ([`scripts/DEMO_ACCOUNTS.md`](scripts/DEMO_ACCOUNTS.md)).
