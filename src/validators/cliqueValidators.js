const { z } = require('zod');

const createCliqueSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
  description: z.string().trim().max(500).optional(),
  activityType: z.string().trim().default('Run'),
  scheduledAt: z.coerce.date().optional(),
  targetDistance: z.number().positive().optional(),
  targetDuration: z.number().int().positive().optional(),
  meetingLocation: z.string().trim().max(200).optional(),
  routeData: z.any().optional(),
});

const updateCliqueStatusSchema = z.object({
  status: z.enum(['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED']),
});

const listCliquesQuerySchema = z.object({
  status: z.enum(['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = {
  createCliqueSchema,
  updateCliqueStatusSchema,
  listCliquesQuerySchema,
};
