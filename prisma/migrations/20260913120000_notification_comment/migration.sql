-- The comment a comment or comment-like notification is about, so tapping it
-- lands on that comment rather than the top of the post. Older notifications
-- stay null and simply open the post at its comments.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "commentId" TEXT;
