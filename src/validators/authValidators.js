const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(72),
});

// Only providers this server can actually verify are accepted. Accepting one
// whose tokens we cannot check would be accepting anything.
//
// No email field, ever: the address decides which account you reach, so it is
// taken from the verified token and nothing else.
//
// The names are the one exception, and only because Apple leaves us no choice.
// Apple puts no name in the identity token and hands it to the app exactly
// once, on the very first authorization. Ignoring it would mean every Apple
// account is permanently nameless. It is treated as the cosmetic hint it is:
// used only to fill a blank on a brand new account, never to decide who you
// are and never to overwrite a name already set.
const socialAuthSchema = z.object({
  provider: z.enum(['GOOGLE', 'APPLE']),
  idToken: z.string().min(1).max(8192),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  // Exactly six digits. Anything else cannot be a code we issued, so it is
  // refused here rather than burning one of the account's few attempts.
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code'),
  newPassword: z.string().min(6).max(72),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  socialAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
