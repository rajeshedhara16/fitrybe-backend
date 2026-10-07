-- A calories goal for a Clique session.
ALTER TABLE "CliqueSession" ADD COLUMN IF NOT EXISTS "targetCalories" INTEGER;
