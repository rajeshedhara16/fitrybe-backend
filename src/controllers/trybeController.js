const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');
const { postVisibilityFilter } = require('../utils/visibility');
const { serializePost, POST_INCLUDE } = require('./postController');

/** Loads the caller's membership row, or null when they are not a member. */
function membershipOf(trybeId, userId) {
  return prisma.trybeMember.findUnique({
    where: { trybeId_userId: { trybeId, userId } },
    select: { id: true, role: true },
  });
}

/**
 * Prisma fragment hiding private Trybes from people who have not joined them.
 * `isPublic` is a declared access control, so it has to be applied on every
 * read path rather than only in the UI.
 */
function trybeVisibilityFilter(viewerId) {
  return {
    OR: [
      { isPublic: true },
      { creatorId: viewerId },
      { members: { some: { userId: viewerId } } },
    ],
  };
}

const TRYBE_INCLUDE = {
  creator: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  _count: { select: { members: true } },
};

function serializeTrybe(trybe, userId) {
  const { _count, members, ...rest } = trybe;
  const isMember = Array.isArray(members)
    ? members.some((m) => m.userId === userId)
    : false;
  return { ...rest, memberCount: _count ? _count.members : 0, isMember };
}

async function listTrybes(req, res) {
  const { cursor, limit, mine, category, search } = req.validatedQuery || req.query;
  const takeLimit = parseInt(limit || 20, 10);

  // ANDed so the caller's `search` OR cannot displace the visibility rule.
  const whereClause = {
    AND: [
      trybeVisibilityFilter(req.userId),
      {
        ...(mine ? { members: { some: { userId: req.userId } } } : {}),
        ...(category
          ? { category: { equals: category, mode: 'insensitive' } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    ],
  };

  const trybes = await prisma.trybe.findMany({
    take: takeLimit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      ...TRYBE_INCLUDE,
      members: req.userId ? { where: { userId: req.userId }, select: { userId: true } } : false,
    },
  });

  const nextCursor = trybes.length === takeLimit ? trybes[trybes.length - 1].id : null;

  res.json({ trybes: trybes.map((t) => serializeTrybe(t, req.userId)), nextCursor });
}

async function createTrybe(req, res) {
  const imageUrl = req.uploads?.[0]?.url;

  const trybe = await prisma.trybe.create({
    data: {
      ...req.body,
      imageUrl,
      creatorId: req.userId,
      members: {
        create: { userId: req.userId, role: 'CREATOR' },
      },
    },
    include: TRYBE_INCLUDE,
  });

  res.status(201).json({ trybe: serializeTrybe(trybe, req.userId) });
}

async function getTrybe(req, res) {
  const trybe = await prisma.trybe.findUnique({
    where: { id: req.params.trybeId },
    include: {
      ...TRYBE_INCLUDE,
      members: req.userId ? { where: { userId: req.userId }, select: { userId: true } } : false,
    },
  });

  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  // A private Trybe should not even confirm its own existence to outsiders.
  // `members` is the include above, narrowed to the caller's own row.
  const callerIsMember = Array.isArray(trybe.members) && trybe.members.length > 0;
  if (!trybe.isPublic && trybe.creatorId !== req.userId && !callerIsMember) {
    throw new AppError(404, 'Trybe not found');
  }

  res.json({ trybe: serializeTrybe(trybe, req.userId) });
}

async function listMembers(req, res) {
  const trybe = await prisma.trybe.findUnique({
    where: { id: req.params.trybeId },
    select: { isPublic: true, creatorId: true },
  });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  if (
    !trybe.isPublic &&
    trybe.creatorId !== req.userId &&
    !(await membershipOf(req.params.trybeId, req.userId))
  ) {
    throw new AppError(404, 'Trybe not found');
  }

  const members = await prisma.trybeMember.findMany({
    where: { trybeId: req.params.trybeId },
    orderBy: { joinedAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          bio: true,
          location: true,
        },
      },
    },
  });
  res.json({ members });
}

async function getLeaderboard(req, res) {
  const { trybeId } = req.params;

  const trybe = await prisma.trybe.findUnique({
    where: { id: trybeId },
    select: { isPublic: true, creatorId: true },
  });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  if (
    !trybe.isPublic &&
    trybe.creatorId !== req.userId &&
    !(await membershipOf(trybeId, req.userId))
  ) {
    throw new AppError(404, 'Trybe not found');
  }

  const members = await prisma.trybeMember.findMany({
    where: { trybeId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          activities: {
            select: { distance: true, duration: true, calories: true },
          },
        },
      },
    },
  });

  const leaderboard = members.map((m) => {
    const totalDistanceMeters = m.user.activities.reduce((acc, a) => acc + (a.distance || 0), 0);
    const totalDistanceKm = parseFloat((totalDistanceMeters / 1000).toFixed(1));
    const workoutCount = m.user.activities.length;

    return {
      userId: m.user.id,
      name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || 'Runner',
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      stat: `${totalDistanceKm} km`,
      distanceKm: totalDistanceKm,
      workoutCount,
    };
  });

  // Sort descending by distance
  leaderboard.sort((a, b) => b.distanceKm - a.distanceKm);

  const rankedLeaderboard = leaderboard.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));

  res.json({ leaderboard: rankedLeaderboard });
}

async function getTrybePosts(req, res) {
  const { trybeId } = req.params;

  const trybe = await prisma.trybe.findUnique({
    where: { id: trybeId },
    select: { isPublic: true, creatorId: true },
  });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }

  const isMember =
    trybe.creatorId === req.userId || !!(await membershipOf(trybeId, req.userId));
  if (!trybe.isPublic && !isMember) {
    throw new AppError(404, 'Trybe not found');
  }

  const trybeMembers = await prisma.trybeMember.findMany({
    where: { trybeId },
    select: { userId: true },
  });

  const memberUserIds = trybeMembers.map((m) => m.userId);

  const posts = await prisma.post.findMany({
    // Members share this Trybe with every author here, so Trybes-only posts
    // are visible to them; an onlooker browsing a public Trybe is not, and
    // the shared visibility filter keeps those posts out of their view.
    where: {
      AND: [
        { authorId: { in: memberUserIds } },
        isMember ? {} : await postVisibilityFilter(req.userId),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      ...POST_INCLUDE,
      likes: { where: { userId: req.userId }, select: { userId: true } },
    },
  });

  // Serialized exactly like the main feed — trimmed activity, `likeCount`,
  // `commentCount` and `likedByMe` — so a post opened from a Trybe carries the
  // same numbers and the same heart state as one opened from the feed.
  res.json({ posts: posts.map((p) => serializePost(p, req.userId)) });
}

async function joinTrybe(req, res) {
  const trybe = await prisma.trybe.findUnique({ where: { id: req.params.trybeId } });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  // Only public Trybes are self-join; a private one has to invite you.
  if (!trybe.isPublic && trybe.creatorId !== req.userId) {
    throw new AppError(403, 'This Trybe is invite-only');
  }

  await prisma.trybeMember.upsert({
    where: { trybeId_userId: { trybeId: trybe.id, userId: req.userId } },
    create: { trybeId: trybe.id, userId: req.userId, role: 'MEMBER' },
    update: {},
  });

  res.status(201).json({ joined: true });
}

async function leaveTrybe(req, res) {
  const membership = await prisma.trybeMember.findUnique({
    where: { trybeId_userId: { trybeId: req.params.trybeId, userId: req.userId } },
  });

  if (membership && membership.role === 'CREATOR') {
    throw new AppError(400, 'The creator cannot leave their own Trybe. Delete it instead.');
  }

  await prisma.trybeMember.deleteMany({
    where: { trybeId: req.params.trybeId, userId: req.userId },
  });

  res.json({ joined: false });
}

async function deleteTrybe(req, res) {
  const trybe = await prisma.trybe.findUnique({ where: { id: req.params.trybeId } });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  if (trybe.creatorId !== req.userId) {
    throw new AppError(403, 'Only the creator can delete this Trybe');
  }
  await prisma.trybe.delete({ where: { id: trybe.id } });
  await deleteByUrls(trybe.imageUrl);
  res.status(204).send();
}

/**
 * Notifies another athlete that they have been invited to a Trybe. Trybes are
 * self-join, so this creates a notification rather than a membership row.
 */
async function inviteToTrybe(req, res) {
  const { userId } = req.body;
  const trybe = await prisma.trybe.findUnique({ where: { id: req.params.trybeId } });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  if (userId === req.userId) {
    throw new AppError(400, 'You are already a member of this Trybe');
  }
  // Inviting on behalf of a Trybe you have not joined is not yours to do.
  if (
    trybe.creatorId !== req.userId &&
    !(await membershipOf(trybe.id, req.userId))
  ) {
    throw new AppError(403, 'Join this Trybe before inviting others');
  }

  const invitee = await prisma.user.findUnique({ where: { id: userId } });
  if (!invitee) {
    throw new AppError(404, 'User not found');
  }

  const existing = await prisma.trybeMember.findUnique({
    where: { trybeId_userId: { trybeId: trybe.id, userId } },
  });
  if (existing) {
    return res.json({ invited: false, alreadyMember: true });
  }

  await createNotification({
    recipientId: userId,
    actorId: req.userId,
    type: 'TRYBE_INVITE',
    title: trybe.name,
    body: `invited you to join "${trybe.name}".`,
    entityId: trybe.id,
  });

  res.status(201).json({ invited: true });
}

module.exports = {
  listTrybes,
  createTrybe,
  getTrybe,
  listMembers,
  getLeaderboard,
  getTrybePosts,
  joinTrybe,
  leaveTrybe,
  deleteTrybe,
  inviteToTrybe,
};
