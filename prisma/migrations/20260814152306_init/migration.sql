-- CreateEnum
CREATE TYPE "SwipeAction" AS ENUM ('LIKE', 'PASS');

-- CreateEnum
CREATE TYPE "WalkEventStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "swipe_events" (
    "id" BIGSERIAL NOT NULL,
    "actorId" VARCHAR(24) NOT NULL,
    "targetId" VARCHAR(24) NOT NULL,
    "action" "SwipeAction" NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchId" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_events" (
    "id" BIGSERIAL NOT NULL,
    "inviteId" VARCHAR(24) NOT NULL,
    "matchId" VARCHAR(24),
    "actorId" VARCHAR(24) NOT NULL,
    "status" "WalkEventStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walk_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swipe_events_actorId_createdAt_idx" ON "swipe_events"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "swipe_events_createdAt_idx" ON "swipe_events"("createdAt");

-- CreateIndex
CREATE INDEX "walk_events_inviteId_idx" ON "walk_events"("inviteId");

-- CreateIndex
CREATE INDEX "walk_events_createdAt_idx" ON "walk_events"("createdAt");
