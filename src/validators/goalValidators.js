const { z } = require('zod');

// Zod strips unknown keys, so every field the client sends has to be declared
// here or it is silently dropped before the controller sees it.
const updateGoalSchema = z.object({
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  activity: z.string().trim().min(1).max(60).optional(),
  metric: z.enum(['Distance', 'Duration', 'Calories', 'Sessions', 'Steps']).optional(),
  targetValue: z.coerce.number().min(0).optional(),
  unit: z.string().trim().max(30).optional(),
  frequency: z.enum(['Daily', 'Weekly', 'Monthly']).optional(),
  targetSteps: z.coerce.number().int().min(0).optional(),
  targetDistance: z.coerce.number().min(0).optional(),
  targetCalories: z.coerce.number().int().min(0).optional(),
  targetWorkouts: z.coerce.number().int().min(0).optional(),
});

module.exports = { updateGoalSchema };
