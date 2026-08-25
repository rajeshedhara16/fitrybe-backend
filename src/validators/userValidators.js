const { z } = require('zod');

const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  dob: z.coerce.date().optional(),
  gender: z.enum(GENDER_VALUES).optional(),
  bio: z.string().trim().max(500).optional(),
  location: z.string().trim().max(120).optional(),
  activityInterests: z.array(z.string().trim().min(1)).max(20).optional(),
  sportInterests: z.array(z.string().trim().min(1)).max(20).optional(),
  height: z.number().positive().optional(),
  weight: z.number().positive().optional(),
  targetWeight: z.number().positive().optional(),
  fitnessGoal: z.string().trim().max(120).optional(),
  stepTarget: z.number().int().positive().optional(),
  weeklyDistanceTarget: z.number().positive().optional(),
  caloriesTarget: z.number().int().positive().optional(),
  onboardingCompleted: z.boolean().optional(),
});

const userSearchSchema = z.object({
  query: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = { updateProfileSchema, userSearchSchema };
