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
  // Display preference only. Nothing stored is ever converted, so this cannot
  // corrupt a logged workout however often it is flipped.
  unitSystem: z.enum(['METRIC', 'IMPERIAL']).optional(),
  // Whether anyone else sees this athlete's workouts at all, their whole
  // history included. Enforced when workouts are read, not stored on them.
  activitiesVisible: z.boolean().optional(),
  // Applies to new posts only; posts already shared keep their audience.
  defaultPostAudience: z.enum(['EVERYONE', 'TRYBES']).optional(),
  discoverable: z.boolean().optional(),
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

// Linking a provider to the account already signed in. Same shape as the
// sign-in body minus the name fields: a link never renames anyone.
const linkIdentitySchema = z.object({
  provider: z.enum(['GOOGLE', 'APPLE']),
  idToken: z.string().min(1).max(8192),
  authorizationCode: z.string().trim().min(1).max(2048).optional(),
});

module.exports = {
  updateProfileSchema,
  userSearchSchema,
  deleteAccountSchema,
  linkIdentitySchema,
};
