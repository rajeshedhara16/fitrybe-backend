const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');
const { postVisibilityFilter, canViewPost } = require('../utils/visibility');
const { serializeActivitySummary } = require('../utils/serializers');

const POST_INCLUDE = {
  author: {
    // `activitiesVisible` is read only to decide whether the attached workout
    // may be shown, and is stripped before the post leaves the server.
    select: { id: true, firstName: true, lastName: true, avatarUrl: true, activitiesVisible: true },
  },
  activity: true,
  _count: { select: { likes: true, comments: true } },
};

const COMMENT_AUTHOR = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true },
};

/**
 * A comment with its like count, whether the viewer liked it, and its replies.
 *
 * Threading is one level deep on purpose: a reply to a reply still belongs to
 * the same conversation, so it is attached to the top-level comment rather
 * than nested further. That keeps the thread readable on a phone and the
 * query a single round trip.
 */
function serializeComment(comment, viewerId) {
  const { _count, likes, replies, ...rest } = comment;
  return {
    ...rest,
    likeCount: _count ? _count.likes : 0,
    likedByMe: Array.isArray(likes) ? likes.length > 0 : false,
    replyCount: _count ? _count.replies : 0,
    replies: Array.isArray(replies)
      ? replies.map((r) => serializeComment(r, viewerId))
      : [],
  };
}

function commentInclude(viewerId, withReplies) {
  return {
    author: COMMENT_AUTHOR,
    _count: { select: { likes: true, replies: true } },
    likes: { where: { userId: viewerId }, select: { id: true } },
    ...(withReplies
      ? {
          replies: {
            orderBy: { createdAt: 'asc' },
            include: {
              author: COMMENT_AUTHOR,
              _count: { select: { likes: true, replies: true } },
              likes: { where: { userId: viewerId }, select: { id: true } },
            },
          },
        }
      : {}),
  };
}

function serializePost(post, viewerId) {
  const { _count, likes, activity, ...rest } = post;
  const { activitiesVisible, ...author } = rest.author || {};

  // The post is a deliberate share with its own audience, so it stays. The
  // workout attached to it does not, once its owner has hidden their workouts
  // or that workout is private: otherwise every stat the profile setting hides
  // would still be one tap away on an old post.
  const hideWorkout = Boolean(
    activity &&
      post.authorId !== viewerId &&
      (activitiesVisible === false || activity.isPublic === false)
  );

  return {
    ...rest,
    ...(rest.author ? { author } : {}),
    activity: hideWorkout ? null : serializeActivitySummary(activity),
    activityHidden: hideWorkout,
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

  // Only when the composer said nothing. Picking an audience there always wins.
  let audience = req.body.audience;
  if (audience === undefined) {
    const author = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { defaultPostAudience: true },
    });
    audience = author?.defaultPostAudience || 'EVERYONE';
  }

  const post = await prisma.post.create({
    data: {
      ...req.body,
      audience,
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

  // Only top-level comments are listed; each carries its own replies, so a
  // reply never appears twice.
  const comments = await prisma.comment.findMany({
    where: { postId: req.params.postId, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: commentInclude(req.userId, true),
  });

  res.json({ comments: comments.map((c) => serializeComment(c, req.userId)) });
}

async function createComment(req, res) {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post || !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Post not found');
  }

  // A reply must belong to a comment on this same post, or it would graft a
  // conversation onto a thread its author may not even be able to see.
  let parent = null;
  if (req.body.parentId) {
    parent = await prisma.comment.findUnique({
      where: { id: req.body.parentId },
      select: { id: true, postId: true, authorId: true, parentId: true },
    });
    if (!parent || parent.postId !== post.id) {
      throw new AppError(400, 'You can only reply to a comment on this post');
    }
  }

  const comment = await prisma.comment.create({
    data: {
      text: req.body.text,
      postId: post.id,
      authorId: req.userId,
      // Replying to a reply attaches to the same top-level comment, keeping
      // the thread one level deep.
      parentId: parent ? parent.parentId || parent.id : undefined,
    },
    include: commentInclude(req.userId, false),
  });

  // Tell the person being replied to, or the post's author for a new comment.
  // Never notify someone about their own action.
  const recipientId = parent ? parent.authorId : post.authorId;
  if (recipientId && recipientId !== req.userId) {
    await createNotification({
      recipientId,
      actorId: req.userId,
      type: 'COMMENT',
      title: parent ? 'New Reply' : 'New Comment',
      body: `${parent ? 'replied' : 'commented'}: "${req.body.text.substring(0, 40)}"`,
      entityId: post.id,
    });
  }

  res.status(201).json({ comment: serializeComment(comment, req.userId) });
}

/** Adds the caller's like to a comment. Liking twice stays one like. */
async function likeComment(req, res) {
  const comment = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    select: { id: true, postId: true, authorId: true },
  });

  const post = comment
    ? await prisma.post.findUnique({ where: { id: comment.postId } })
    : null;
  if (!comment || comment.postId !== req.params.postId || !post ||
      !(await canViewPost(req.userId, post))) {
    throw new AppError(404, 'Comment not found');
  }

  await prisma.commentLike.upsert({
    where: {
      commentId_userId: { commentId: comment.id, userId: req.userId },
    },
    create: { commentId: comment.id, userId: req.userId },
    update: {},
  });

  if (comment.authorId !== req.userId) {
    await createNotification({
      recipientId: comment.authorId,
      actorId: req.userId,
      type: 'LIKE',
      title: 'New Like',
      body: 'liked your comment.',
      entityId: comment.postId,
    });
  }

  const likeCount = await prisma.commentLike.count({
    where: { commentId: comment.id },
  });
  res.status(201).json({ liked: true, likeCount });
}

async function unlikeComment(req, res) {
  await prisma.commentLike.deleteMany({
    where: { commentId: req.params.commentId, userId: req.userId },
  });

  const likeCount = await prisma.commentLike.count({
    where: { commentId: req.params.commentId },
  });
  res.json({ liked: false, likeCount });
}

module.exports = {
  // Shared so every surface that returns a post — the feed, a single post, a
  // Trybe's posts — hands the client the same shape. A card that has to guess
  // between `_count.likes` and `likeCount` gets one of them wrong.
  serializePost,
  POST_INCLUDE,
  listFeed,
  createPost,
  getPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  listComments,
  createComment,
  likeComment,
  unlikeComment,
};
