-- Privacy defaults. Each applies only to things created after it is set:
-- existing activities and posts keep the visibility they were saved with, so
-- changing a default can never retroactively expose or hide anything.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "defaultActivityPublic" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "defaultPostAudience" "PostAudience" NOT NULL DEFAULT 'EVERYONE';

-- Search visibility only. It does not make a profile private; someone holding
-- a direct link still sees it.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "discoverable" BOOLEAN NOT NULL DEFAULT true;
