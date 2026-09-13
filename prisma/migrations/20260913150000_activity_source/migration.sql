-- Where a workout was recorded, so the solo recorder's history can leave out
-- workouts recorded in a clique. Every existing workout starts as RECORDED.
DO $$
BEGIN
  CREATE TYPE "ActivitySource" AS ENUM ('RECORDED', 'CLIQUE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "source" "ActivitySource" NOT NULL DEFAULT 'RECORDED';
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cliqueSessionId" TEXT;

CREATE INDEX IF NOT EXISTS "Activity_userId_source_idx" ON "Activity"("userId", "source");
CREATE INDEX IF NOT EXISTS "Activity_cliqueSessionId_idx" ON "Activity"("cliqueSessionId");

DO $$
BEGIN
  ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_cliqueSessionId_fkey"
    FOREIGN KEY ("cliqueSessionId") REFERENCES "CliqueSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Clique workouts saved before this had no marker, but the clique screen always
-- shared them with a post saying "with my Clique!" linked to the workout. That
-- is the only trace, so it is used to mark them. The session itself was never
-- recorded, so cliqueSessionId stays null for these.
UPDATE "Activity"
SET "source" = 'CLIQUE'
WHERE "id" IN (
  SELECT "activityId" FROM "Post"
  WHERE "activityId" IS NOT NULL AND "caption" LIKE '%with my Clique!%'
);
