-- An athlete can now hold one goal per period (daily, weekly, monthly) rather
-- than a single goal overall.
--
-- Goals were previously updated via findFirst, so a user should only ever have
-- one row — but drop any duplicates per (userId, period) before the unique
-- index goes on, keeping the most recently updated of each.
DELETE FROM "UserGoal" a
USING "UserGoal" b
WHERE a."userId" = b."userId"
  AND a."period" = b."period"
  AND (a."updatedAt" < b."updatedAt"
       OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

CREATE UNIQUE INDEX IF NOT EXISTS "UserGoal_userId_period_key"
  ON "UserGoal"("userId", "period");
