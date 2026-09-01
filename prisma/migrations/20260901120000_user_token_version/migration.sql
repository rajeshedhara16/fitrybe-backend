-- Refresh tokens are stateless, so a stolen one stayed valid for its full 30
-- days with no way to revoke it. Signing the current version into the token
-- and bumping this column on logout / password change invalidates every
-- refresh token issued before that point.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
