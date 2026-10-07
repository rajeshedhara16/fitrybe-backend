-- What each athlete did, kept when they finish their leg.
ALTER TABLE "CliqueParticipant" ADD COLUMN IF NOT EXISTS "currentDuration" INTEGER;
ALTER TABLE "CliqueParticipant" ADD COLUMN IF NOT EXISTS "currentCalories" INTEGER;
