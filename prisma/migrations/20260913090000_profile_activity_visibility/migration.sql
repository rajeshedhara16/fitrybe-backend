-- The workout visibility switch now covers a profile's whole history rather
-- than only workouts logged after it was set. It is checked whenever someone
-- else reads a workout instead of being copied onto each one, so the column is
-- renamed to say what it now means. Existing values carry over unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'defaultActivityPublic'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "defaultActivityPublic" TO "activitiesVisible";
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "activitiesVisible" BOOLEAN NOT NULL DEFAULT true;
