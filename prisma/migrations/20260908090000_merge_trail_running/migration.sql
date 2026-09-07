-- "Trail Running" is retired: it is running, and keeping it separate split an
-- athlete's records and goals across two names for the same sport.
--
-- Goal matching is exact, so any activity left under the old name would stop
-- counting toward a Running goal entirely. Fold the existing rows in.
UPDATE "Activity" SET "type" = 'Running' WHERE "type" = 'Trail Running';
UPDATE "UserGoal" SET "activity" = 'Running' WHERE "activity" = 'Trail Running';

-- Interests are arrays; swap the element and drop the duplicate that leaves
-- behind for anyone who listed both.
UPDATE "User"
SET "activityInterests" = ARRAY(
  SELECT DISTINCT CASE WHEN i = 'Trail Running' THEN 'Running' ELSE i END
  FROM unnest("activityInterests") AS i
)
WHERE 'Trail Running' = ANY("activityInterests");

UPDATE "Trybe"
SET "activityInterests" = ARRAY(
  SELECT DISTINCT CASE WHEN i = 'Trail Running' THEN 'Running' ELSE i END
  FROM unnest("activityInterests") AS i
)
WHERE 'Trail Running' = ANY("activityInterests");

UPDATE "CliqueSession" SET "activityType" = 'Running' WHERE "activityType" = 'Trail Running';
