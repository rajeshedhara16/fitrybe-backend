-- Comments can now be liked and replied to.

-- Replies. Cascade so deleting a comment takes the thread under it, rather
-- than leaving replies pointing at nothing.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
CREATE INDEX IF NOT EXISTS "Comment_parentId_idx" ON "Comment"("parentId");

DO $$
BEGIN
  ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Likes, one per person per comment.
CREATE TABLE IF NOT EXISTS "CommentLike" (
  "id"        TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommentLike_commentId_userId_key"
  ON "CommentLike"("commentId", "userId");
CREATE INDEX IF NOT EXISTS "CommentLike_commentId_idx" ON "CommentLike"("commentId");

DO $$
BEGIN
  ALTER TABLE "CommentLike"
    ADD CONSTRAINT "CommentLike_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "Comment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CommentLike"
    ADD CONSTRAINT "CommentLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
