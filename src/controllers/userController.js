const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { serializeUser } = require('../utils/serializers');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');

async function getUserById(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const [followerCount, followingCount, postCount, activityCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.post.count({ where: { authorId: user.id } }),
    prisma.activity.count({ where: { userId: user.id } }),
  ]);

  let isFollowing = false;
  if (req.userId && req.userId !== user.id) {
    const followRecord = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: req.userId, followingId: user.id } },
    });
    isFollowing = !!followRecord;
  }

  res.json({
    user: serializeUser(user),
    stats: { followerCount, followingCount, postCount, activityCount },
    isFollowing,
  });
}

async function searchUsers(req, res) {
  // Accept `q` as well as `query` so clients can use either spelling.
  const { query, q, limit, suggested } = req.validatedQuery;
  const term = query || q;

  const users = await prisma.user.findMany({
    take: limit,
    where: {
      // Never surface the caller to themselves in search or suggestions.
      id: { not: req.userId },
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { location: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
      // "Grow your trybe" wants people the caller does not already follow.
      ...(suggested ? { followers: { none: { followerId: req.userId } } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      location: true,
      bio: true,
      followers: { where: { followerId: req.userId }, select: { id: true } },
    },
  });

  res.json({
    users: users.map(({ followers, ...u }) => ({
      ...u,
      isFollowing: followers.length > 0,
    })),
  });
}

async function updateMe(req, res) {
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: req.body,
  });
  res.json({ user: serializeUser(user) });
}

async function uploadAvatar(req, res) {
  const uploaded = req.uploads?.[0];
  if (!uploaded) {
    throw new AppError(400, 'No file uploaded');
  }

  const previous = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { avatarUrl: true },
  });

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { avatarUrl: uploaded.url },
  });

  // The old photo is unreachable now that the row points elsewhere.
  await deleteByUrls(previous?.avatarUrl);

  res.json({ user: serializeUser(user) });
}

async function uploadBanner(req, res) {
  const uploaded = req.uploads?.[0];
  if (!uploaded) {
    throw new AppError(400, 'No file uploaded');
  }

  const previous = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { bannerUrl: true },
  });

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { bannerUrl: uploaded.url },
  });

  await deleteByUrls(previous?.bannerUrl);

  res.json({ user: serializeUser(user) });
}

async function followUser(req, res) {
  const targetId = req.params.userId;
  if (targetId === req.userId) {
    throw new AppError(400, 'You cannot follow yourself');
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new AppError(404, 'User not found');
  }

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: req.userId, followingId: targetId } },
    create: { followerId: req.userId, followingId: targetId },
    update: {},
  });

  // Trigger notification
  await createNotification({
    recipientId: targetId,
    actorId: req.userId,
    type: 'FOLLOW',
    title: 'New Follower',
    body: 'started following you.',
  });

  res.status(201).json({ following: true });
}

async function unfollowUser(req, res) {
  const targetId = req.params.userId;
  await prisma.follow.deleteMany({
    where: { followerId: req.userId, followingId: targetId },
  });
  res.json({ following: false });
}

async function getFollowers(req, res) {
  const { userId } = req.params;
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: {
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

  res.json({ followers: followers.map((f) => f.follower) });
}

async function getFollowing(req, res) {
  const { userId } = req.params;
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      following: {
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

  res.json({ following: following.map((f) => f.following) });
}

module.exports = {
  getUserById,
  searchUsers,
  updateMe,
  uploadAvatar,
  uploadBanner,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
};
