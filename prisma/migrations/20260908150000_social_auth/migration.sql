-- Signing in with Google creates accounts that never hold a password, so the
-- column can no longer be NOT NULL. Existing rows are untouched: they all have
-- a hash already.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- One row per way of signing in to an account. Kept apart from the user row so
-- the same person can hold a Google identity and an Apple one against a single
-- account, rather than ending up with two.
CREATE TABLE IF NOT EXISTS "AuthIdentity" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "provider"       TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "email"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- One account per provider identity. This is the constraint that makes a
-- second sign-in find the first one's account instead of creating another.
CREATE UNIQUE INDEX IF NOT EXISTS "AuthIdentity_provider_providerUserId_key"
  ON "AuthIdentity"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

DO $$
BEGIN
  ALTER TABLE "AuthIdentity"
    ADD CONSTRAINT "AuthIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
