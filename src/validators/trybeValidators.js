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

// A weekly goal in kilometres. Multipart forms send numbers as text, and an
// empty value is how a form clears the goal, so "" and null both mean none.
const weeklyGoalKm = z
  .union([z.null(), z.literal(''), z.coerce.number().positive().max(100000)])
  .optional()
  .transform((v) => (v === '' ? null : v));

const createTrybeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  isPublic: looseBoolean.optional().default(true),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  activityInterests: stringList.optional().default([]),
  weeklyGoalKm,
});

// Everything optional: only fields that are sent are changed.
const updateTrybeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  isPublic: looseBoolean.optional(),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  activityInterests: stringList.optional(),
  weeklyGoalKm,
  removeImage: looseBoolean.optional(),
});

// The client sends the start of its own week or month, since only it knows the
// athlete's timezone. Absent means all time.
const leaderboardQuerySchema = z.object({
  since: z.coerce.date().optional(),
});

const feedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const muteSchema = z.object({ muted: z.boolean() });

const memberRoleSchema = z.object({ role: z.enum(['CAPTAIN', 'MEMBER']) });

const eventFields = {
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(200).optional(),
  activityType: z.string().trim().max(60).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
};

const createEventSchema = z.object(eventFields);

const updateEventSchema = z.object({
  title: eventFields.title.optional(),
  description: eventFields.description,
  location: eventFields.location,
  activityType: eventFields.activityType,
  startsAt: eventFields.startsAt.optional(),
  endsAt: eventFields.endsAt,
});

const eventsQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
});

const listTrybesSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mine: looseBoolean.optional(),
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = {
  createTrybeSchema,
  updateTrybeSchema,
  listTrybesSchema,
  leaderboardQuerySchema,
  feedQuerySchema,
  muteSchema,
  memberRoleSchema,
  createEventSchema,
  updateEventSchema,
  eventsQuerySchema,
};
