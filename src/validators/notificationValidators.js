const { z } = require('zod');

// `z.coerce.boolean()` would turn the string "false" into true, so parse the
// literal text instead.
const looseBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.trim().toLowerCase() === 'true'));

const listNotificationsQuerySchema = z.object({
  unreadOnly: looseBoolean.optional().default(false),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = { listNotificationsQuerySchema };
