const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { serializeUser } = require('../utils/serializers');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');

const SALT_ROUNDS = 12;

async function register(req, res) {
  const { email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, user.tokenVersion);

  res.status(201).json({ user: serializeUser(user), accessToken, refreshToken });
}

async function login(req, res) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password');
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, user.tokenVersion);

  res.json({ user: serializeUser(user), accessToken, refreshToken });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
    if (payload.type !== 'refresh') throw new Error('Wrong token type');
  } catch (err) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  // Anything issued before the last logout or password change is dead, even
  // though the signature still checks out and the expiry has not passed.
  if ((payload.ver ?? 0) !== user.tokenVersion) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const accessToken = signAccessToken(user.id);
  const newRefreshToken = signRefreshToken(user.id, user.tokenVersion);

  res.json({ accessToken, refreshToken: newRefreshToken });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  res.json({ user: serializeUser(user) });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    throw new AppError(401, 'Current password is incorrect');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // Changing the password signs every other device out.
  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  // Keep the caller signed in on this device with freshly versioned tokens.
  res.json({
    success: true,
    message: 'Password updated successfully',
    accessToken: signAccessToken(updated.id),
    refreshToken: signRefreshToken(updated.id, updated.tokenVersion),
  });
}

/**
 * Revokes every refresh token this account holds. Access tokens are stateless
 * and stay valid until they expire, which is why they are short-lived.
 */
async function logout(req, res) {
  await prisma.user.update({
    where: { id: req.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  res.json({ success: true });
}

module.exports = { register, login, refresh, me, changePassword, logout };
