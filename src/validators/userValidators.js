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

// `z.coerce.boolean()` would turn the string "false" into true, so parse the
// literal text instead.
const looseBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.trim().toLowerCase() === 'true'));

// Clients send either `query` or `q`. `limit` is bounded here so a junk value
// can never reach Prisma as `take: NaN`.
const userSearchSchema = z.object({
  query: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  suggested: looseBoolean.optional().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Deleting an account that has a password requires that password. One reached
// only through Google or Apple has none to give, so the field is optional here
// and the controller decides which case applies.
const deleteAccountSchema = z.object({
  password: z.string().min(1).max(72).optional(),
});

module.exports = { updateProfileSchema, userSearchSchema, deleteAccountSchema };
