const { z } = require('zod');

// Multipart form fields arrive as strings and can't repeat a key from most
// clients, so accept either a real array or a comma-separated list.
const stringList = z
  .union([z.array(z.string().trim().min(1)), z.string()])
  .transform((v) =>
    Array.isArray(v)
      ? v
      : v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
  );

// `z.coerce.boolean()` would turn the string "false" into true, so parse the
// literal text instead.
const looseBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.trim().toLowerCase() === 'true'));

const createTrybeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  isPublic: looseBoolean.optional().default(true),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  activityInterests: stringList.optional().default([]),
});

const listTrybesSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mine: looseBoolean.optional(),
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = { createTrybeSchema, listTrybesSchema };
