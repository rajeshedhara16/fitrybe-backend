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

// Only providers this server can actually verify are accepted. 'APPLE' joins
// the list the day the Apple token check lands, not before — accepting a
// provider we cannot check would be accepting anything.
//
// No email or name field: whatever the client claims about who it is would be
// unsigned, and the verified token carries all of it anyway.
const socialAuthSchema = z.object({
  provider: z.enum(['GOOGLE']),
  idToken: z.string().min(1).max(8192),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  socialAuthSchema,
};
