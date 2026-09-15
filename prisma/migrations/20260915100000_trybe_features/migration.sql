-- Trybe features that used to be for show: a real weekly goal, per-member
-- notification muting, stored post reports, posts hidden per person, and
-- scheduled events with RSVPs.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRYBE_EVENT';

ALTER TABLE "Trybe" ADD COLUMN IF NOT EXISTS "weeklyGoalKm" DOUBLE PRECISION;
ALTER TABLE "TrybeMember"
  ADD COLUMN IF NOT EXISTS "notificationsMuted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PostReport" (
  "id"         TEXT NOT NULL,
  "postId"     TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "details"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostReport_postId_reporterId_key" ON "PostReport"("postId", "reporterId");
CREATE INDEX IF NOT EXISTS "PostReport_createdAt_idx" ON "PostReport"("createdAt");

CREATE TABLE IF NOT EXISTS "HiddenPost" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HiddenPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HiddenPost_userId_postId_key" ON "HiddenPost"("userId", "postId");
CREATE INDEX IF NOT EXISTS "HiddenPost_userId_idx" ON "HiddenPost"("userId");

CREATE TABLE IF NOT EXISTS "TrybeEvent" (
  "id"           TEXT NOT NULL,
  "trybeId"      TEXT NOT NULL,
  "creatorId"    TEXT,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "location"     TEXT,
  "activityType" TEXT,
  "startsAt"     TIMESTAMP(3) NOT NULL,
  "endsAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrybeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrybeEvent_trybeId_startsAt_idx" ON "TrybeEvent"("trybeId", "startsAt");

CREATE TABLE IF NOT EXISTS "TrybeEventRsvp" (
  "id"        TEXT NOT NULL,
  "eventId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrybeEventRsvp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrybeEventRsvp_eventId_userId_key" ON "TrybeEventRsvp"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "TrybeEventRsvp_userId_idx" ON "TrybeEventRsvp"("userId");

DO $$ BEGIN
  ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HiddenPost" ADD CONSTRAINT "HiddenPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HiddenPost" ADD CONSTRAINT "HiddenPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TrybeEvent" ADD CONSTRAINT "TrybeEvent_trybeId_fkey" FOREIGN KEY ("trybeId") REFERENCES "Trybe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TrybeEvent" ADD CONSTRAINT "TrybeEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TrybeEventRsvp" ADD CONSTRAINT "TrybeEventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TrybeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TrybeEventRsvp" ADD CONSTRAINT "TrybeEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
