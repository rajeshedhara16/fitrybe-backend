-- Goal customisation fields. These were previously applied to development
-- databases with `prisma db push`, so guard each one to keep this migration
-- safe to run against an already-synced database.
ALTER TABLE "UserGoal" ADD COLUMN IF NOT EXISTS "activity" TEXT NOT NULL DEFAULT 'Running';
ALTER TABLE "UserGoal" ADD COLUMN IF NOT EXISTS "metric" TEXT NOT NULL DEFAULT 'Distance';
ALTER TABLE "UserGoal" ADD COLUMN IF NOT EXISTS "targetValue" DOUBLE PRECISION NOT NULL DEFAULT 50.0;
ALTER TABLE "UserGoal" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'Miles';
ALTER TABLE "UserGoal" ADD COLUMN IF NOT EXISTS "frequency" TEXT NOT NULL DEFAULT 'Weekly';

-- Lobby readiness for a Clique participant. Orthogonal to `status`: a JOINED
-- member toggles this while waiting for the host to start the activity.
ALTER TABLE "CliqueParticipant" ADD COLUMN IF NOT EXISTS "isReady" BOOLEAN NOT NULL DEFAULT false;
