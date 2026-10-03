-- Workouts imported from Apple Health and Health Connect.
ALTER TYPE "ActivitySource" ADD VALUE IF NOT EXISTS 'HEALTH';

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "sourceName" TEXT;

-- One row per health-store workout per athlete. Postgres allows many NULLs in
-- a unique index, so app-recorded workouts are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "Activity_userId_externalId_key" ON "Activity"("userId", "externalId");
