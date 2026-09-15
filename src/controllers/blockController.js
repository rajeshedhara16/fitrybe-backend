const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const USER_CARD = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true, location: true },
};

/**
 * Blocks someone. Follows in both directions end, and notifications between
 * the two are cleared, so nothing from the blocked person is left waiting in
 * the blocker's list, a pending invite included. Blocking twice stays one block.
 */
async function blockUser(req, res) {
  const targetId = req.params.userId;
  if (targetId === req.userId) {
    throw new AppError(400, 'You cannot block yourself');
  }
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) {
    throw new AppError(404, 'User not found');
  }

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: req.userId, blockedId: targetId } },
      create: { blockerId: req.userId, blockedId: targetId },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: req.userId, followingId: targetId },
          { followerId: targetId, followingId: req.userId },
        ],
      },
    }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { recipientId: req.userId, actorId: targetId },
          { recipientId: targetId, actorId: req.userId },
        ],
      },
    }),
  ]);

  res.status(201).json({ blocked: true });
}

/** Lifts a block the caller made. Follows ended by it do not come back. */
async function unblockUser(req, res) {
  await prisma.userBlock.deleteMany({
    where: { blockerId: req.userId, blockedId: req.params.userId },
  });
  res.json({ blocked: false });
}

/** The people the caller has blocked, most recent first. */
async function listBlockedUsers(req, res) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: USER_CARD },
  });
  res.json({ users: rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt })) });
}

module.exports = { blockUser, unblockUser, listBlockedUsers };
