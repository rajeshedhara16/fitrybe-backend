const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');
const { postVisibilityFilter, canViewPost } = require('../utils/visibility');

const POST_INCLUDE = {
  author: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  activity: true,
  _count: { select: { likes: true, comments: true } },
};

function serializePost(post, viewerId) {
  const { _count, likes, ...rest } = post;
  return {
    ...rest,
    likeCount: _count ? _count.likes : 0,
    commentCount: _count ? _count.comments : 0,
    likedByMe: Array.isArray(likes) ? likes.some((l) => l.userId === viewerId) : false,
  };
}

async function listFeed(req, res) {
  const { authorId, userId, type, cursor, limit } = req.validatedQuery || req.query;
  const targetAuthor = authorId || userId;
  const takeLimit = parseInt(limit || 20, 10);

  // ANDed rather than merged so the audience rule cannot be displaced by the
  // caller's own filters.
  const whereClause = {
    AND: [
      await postVisibilityFilter(req.userId),
      {
        ...(targetAuthor ? { authorId: targetAuthor } : {}),
        ...(type ? { type } : {}),
      },
    ],
  };

  const posts = await prisma.post.findMany({
    take: takeLimit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      ...POST_INCLUDE,
      likes: req.userId ? { where: { userId: req.userId }, select: { userId: true } } : false,
    },
  });

  const nextCursor = posts.length === takeLimit ? posts[posts.length - 1].id : null;

  res.json({
    posts: posts.map((p) => serializePost(p, req.userId)),
    nextCursor,
  });
}

async function createPost(req, res) {
  const imageUrls = (req.uploads || []).map((u) => u.url);

  if (!req.body.caption && imageUrls.length === 0) {
    throw new AppError(400, 'Add a caption or at least one photo to post');
  }

  const post = await prisma.post.create({
    data: {
      ...req.body,
      imageUrls,
      authorId: req.userId,
    },
    include: POST_INCLUDE,
  });

  res.status(201).json({ post: serializePost(post, req.userId) });
}

async function getPost(req, res) {
  const post = await prisma.post.findUnique({
    where: { id: req.params.postId },
    include: {
      ...POST_INCLUDE,
      likes: req.userId ? { where: { userId: req.userId }, select: { userId: true } } : false,
    },
  });
  // Don't reveal that a Trybes-only post exists to someone outside its Trybes.
  if (!post || !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Post not found');
  }
  res.json({ post: serializePost(post, req.userId) });
}

async function updatePost(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  if (post.authorId !== req.userId) {
    throw new AppError(403, 'You can only edit your own posts');
  }

  const { caption, locationTag } = req.body;
  if (caption !== undefined && !caption && post.imageUrls.length === 0) {
    throw new AppError(400, 'A post needs a caption or at least one photo');
  }

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: {
      ...(caption !== undefined ? { caption } : {}),
      ...(locationTag !== undefined ? { locationTag } : {}),
    },
    include: {
      ...POST_INCLUDE,
      likes: { where: { userId: req.userId }, select: { userId: true } },
    },
  });

  res.json({ post: serializePost(updated, req.userId) });
}

async function deletePost(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  if (post.authorId !== req.userId) {
    throw new AppError(403, 'You can only delete your own posts');
  }
  await prisma.post.delete({ where: { id: post.id } });

  // Nothing references these once the row is gone, so they would otherwise sit
  // in the bucket forever being paid for.
  await deleteByUrls(post.imageUrls);

  res.status(204).send();
}

async function likePost(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post || !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Post not found');
  }

  await prisma.like.upsert({
    where: { postId_userId: { postId: post.id, userId: req.userId } },
    create: { postId: post.id, userId: req.userId },
    update: {},
  });

  // Create notification if not liking own post
  if (post.authorId !== req.userId) {
    await createNotification({
      recipientId: post.authorId,
      actorId: req.userId,
      type: 'LIKE',
      title: 'New Like',
      body: 'liked your post.',
      entityId: post.id,
    });
  }

  res.status(201).json({ liked: true });
}

async function unlikePost(req, res) {
  await prisma.like.deleteMany({
    where: { postId: req.params.postId, userId: req.userId },
  });
  res.json({ liked: false });
}

async function listComments(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post || !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Post not found');
  }

  const comments = await prisma.comment.findMany({
    where: { postId: req.params.postId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });
  res.json({ comments });
}

async function createComment(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post || !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Post not found');
  }

  const comment = await prisma.comment.create({
    data: {
      text: req.body.text,
      postId: post.id,
      authorId: req.userId,
    },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });

  // Create notification if not commenting on own post
  if (post.authorId !== req.userId) {
    await createNotification({
      recipientId: post.authorId,
      actorId: req.userId,
      type: 'COMMENT',
      title: 'New Comment',
      body: `commented: "${req.body.text.substring(0, 40)}"`,
      entityId: post.id,
    });
  }

  res.status(201).json({ comment });
}

module.exports = {
  listFeed,
  createPost,
  getPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  listComments,
  createComment,
};
