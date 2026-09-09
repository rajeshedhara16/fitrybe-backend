-- Apple requires an app offering Sign in with Apple to revoke the user's tokens
-- when their account is deleted, and revoking needs a token to revoke. Obtained
-- by exchanging the authorization code at sign-in, and used for nothing else.
ALTER TABLE "AuthIdentity" ADD COLUMN IF NOT EXISTS "providerRefreshToken" TEXT;
