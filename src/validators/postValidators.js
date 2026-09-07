const { z } = require('zod');

const createPostSchema = z.object({
  // Photo-only posts are allowed, so an empty caption is valid. The controller
  // rejects a post that has neither text nor images.
  caption: z.string().trim().max(2200).optional().default(''),
  type: z.string().trim().min(1).max(40).default('Update'),
  audience: z.enum(['EVERYONE', 'TRYBES']).default('EVERYONE'),
  locationTag: z.string().trim().max(120).optional(),
  activityId: z.string().uuid().optional(),
});

// Only the text of a post is editable; images, audience and the linked
// activity are fixed once published.
const updatePostSchema = z.object({
  caption: z.string().trim().max(2200).optional(),
  locationTag: z.string().trim().max(120).optional(),
});

// `parentId` turns a comment into a reply to an existing one.
const createCommentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

const listPostsQuerySchema = z.object({
  authorId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  type: z.string().trim().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const paginationSchema = listPostsQuerySchema;

module.exports = {
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  listPostsQuerySchema,
  paginationSchema,
};
