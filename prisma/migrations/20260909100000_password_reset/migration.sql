-- One-time codes for password reset. The code is never stored, only a bcrypt
-- hash of it, so reading this table gets an attacker nothing usable.
CREATE TABLE IF NOT EXISTS "PasswordReset" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId");
-- Expiry is indexed so sweeping dead rows never has to scan the table.
CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

DO $$
BEGIN
  ALTER TABLE "PasswordReset"
    ADD CONSTRAINT "PasswordReset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
