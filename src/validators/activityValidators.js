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
  // Set only by the clique screen. Marks the workout as recorded in that
  // session, which keeps it out of the solo recorder's history.
  cliqueSessionId: z.string().uuid().optional(),
});

/**
 * One workout read out of Apple Health or Health Connect.
 *
 * `externalId` is the health store's own id for it, which is what makes a
 * repeated import land on the same row instead of a second copy. `startTime`
 * is required: an imported workout is filed on the day it happened, not the
 * day it was imported.
 */
const importedActivitySchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(40).default('Workout'),
  duration: z.number().int().min(1),
  distance: z.number().min(0).default(0),
  calories: z.number().int().min(0).default(0),
  elevationGain: z.number().min(0).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  sourceName: z.string().trim().max(120).optional(),
  isPublic: z.boolean().optional(),
});

const importActivitiesSchema = z.object({
  activities: z.array(importedActivitySchema).min(1).max(200),
});

const listActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  type: z.string().trim().optional(),
  // Narrows to where workouts were recorded; absent returns both.
  source: z.enum(['RECORDED', 'CLIQUE', 'HEALTH']).optional(),
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
  importActivitiesSchema,
  listActivitiesQuerySchema,
  analyticsQuerySchema,
};
