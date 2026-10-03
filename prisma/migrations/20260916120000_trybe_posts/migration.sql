-- Posts shared into a Trybe.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "trybeId" TEXT;

CREATE INDEX IF NOT EXISTS "Post_trybeId_idx" ON "Post"("trybeId");

DO $$ BEGIN
    ALTER TABLE "Post" ADD CONSTRAINT "Post_trybeId_fkey"
        FOREIGN KEY ("trybeId") REFERENCES "Trybe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
