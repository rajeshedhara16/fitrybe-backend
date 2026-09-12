-- Kilometres or miles. Display only: distances stay in metres and weights in
-- kilograms whatever this says, so switching it never rewrites a stored value
-- and can never corrupt a logged workout.
DO $$
BEGIN
  CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "unitSystem" "UnitSystem" NOT NULL DEFAULT 'METRIC';
