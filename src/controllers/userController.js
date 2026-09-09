const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { serializeUser } = require('../utils/serializers');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');
const bcrypt = require('bcryptjs');
const appleTokens = require('../services/appleTokens');

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

/**
 * Permanently deletes the caller's account.
 *
 * Required by App Review guideline 5.1.1(v) of any app that lets people create
 * an account. It is a real deletion, not a flag: the row goes, and every
 * post, activity, comment, message, goal and membership goes with it through
 * the schema's cascades.
 *
 * Order matters. Apple is told first and the image URLs are read first, because
 * once the row is gone both the tokens and the paths are unrecoverable, and the
 * files would sit in the bucket being paid for forever.
 */
async function deleteMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, passwordHash: true, avatarUrl: true, bannerUrl: true },
  });
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  // An account with a password proves it is really them. One without has no
  // password to give — they got here through a provider — so the app's typed
  // confirmation is what stands in, and the access token is the proof.
  if (user.passwordHash) {
    const password = `${req.body.password || ''}`;
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'That password is incorrect');
    }
  }

  // Apple requires the account to be revoked with them, not merely forgotten
  // here. Best effort: if Apple is unreachable the deletion still goes through,
  // because someone must never be trapped in an account they asked to leave.
  const identities = await prisma.authIdentity.findMany({
    where: { userId: user.id, provider: 'APPLE' },
    select: { providerRefreshToken: true },
  });
  for (const identity of identities) {
    await appleTokens.revokeToken(identity.providerRefreshToken);
  }

  // Read while the rows still exist. Post images are the bulk of it.
  const posts = await prisma.post.findMany({
    where: { authorId: user.id },
    select: { imageUrls: true },
  });
  const media = [
    user.avatarUrl,
    user.bannerUrl,
    ...posts.flatMap((p) => p.imageUrls),
  ].filter(Boolean);

  await prisma.user.delete({ where: { id: user.id } });

  // After the row, never before: an orphaned file is untidy, but a deleted file
  // still referenced by a live account is a broken profile.
  await deleteByUrls(media);

  res.status(204).send();
}

module.exports = {
  getUserById,
  deleteMe,
  searchUsers,
  updateMe,
  uploadAvatar,
  uploadBanner,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
};
