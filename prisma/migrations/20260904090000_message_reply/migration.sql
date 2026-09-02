-- Replies quote an earlier message in the same conversation. ON DELETE SET NULL
-- so removing the quoted message leaves its replies intact, just unquoted.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;

CREATE INDEX IF NOT EXISTS "Message_replyToId_idx" ON "Message"("replyToId");

DO $$
BEGIN
  ALTER TABLE "Message"
    ADD CONSTRAINT "Message_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "Message"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
