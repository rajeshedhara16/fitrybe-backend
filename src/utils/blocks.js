const prisma = require('../config/prisma');
const { canViewPost } = require('./visibility');

/**
 * Everyone the user has blocked and everyone who has blocked them.
 *
 * A block works in both directions, so every read that hides blocked people
 * needs both sides. Returning ids rather than a Prisma fragment lets callers
 * fold it into `notIn` next to their own filters.
 */
async function blockedUserIds(userId) {
  if (!userId) return [];
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

/** Whether either of two people has blocked the other. */
async function isBlockedBetween(a, b) {
  if (!a || !b || a === b) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

/** [canViewPost], and not written by someone on the other side of a block. */
async function canSeePost(viewerId, post) {
  if (!post) return false;
  if (await isBlockedBetween(viewerId, post.authorId)) return false;
  return canViewPost(viewerId, post);
}

module.exports = { blockedUserIds, isBlockedBetween, canSeePost };
