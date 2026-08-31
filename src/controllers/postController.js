const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { publicUrlFor } = require('../middleware/upload');
const { createNotification } = require('../utils/notify');

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

  const whereClause = {
    ...(targetAuthor ? { authorId: targetAuthor } : {}),
    ...(type ? { type } : {}),
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
  const imageUrls = (req.files || []).map((f) => publicUrlFor('posts', f.filename));

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
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  res.json({ post: serializePost(post, req.userId) });
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
  res.status(204).send();
}

async function likePost(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) {
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
  if (!post) {
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
  deletePost,
  likePost,
  unlikePost,
  listComments,
  createComment,
};
