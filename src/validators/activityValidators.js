const { z } = require('zod');

const logActivitySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
  type: z.string().trim().default('Run'),
  duration: z.number().int().min(1, 'Duration must be at least 1 second'),
  distance: z.number().min(0, 'Distance must be non-negative'),
  calories: z.number().int().min(0).default(0),
  avgPace: z.number().optional(),
  maxSpeed: z.number().optional(),
  elevationGain: z.number().optional().default(0),
  routeData: z.any().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  // Per-workout switch, stored public when absent. Whether anyone else sees
  // the workout also depends on its owner's profile visibility, which is
  // checked when it is read rather than copied onto it here.
  isPublic: z.boolean().optional(),
  createPost: z.boolean().optional().default(false),
});

const listActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  type: z.string().trim().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// `userId` is rejected outright unless it is a real uuid, so a malformed one
// can never reach Prisma as a `take`/`where` value.
const analyticsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
});

module.exports = {
  logActivitySchema,
  listActivitiesQuerySchema,
  analyticsQuerySchema,
};
