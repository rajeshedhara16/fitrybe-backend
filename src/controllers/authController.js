const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { serializeUser } = require('../utils/serializers');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');
const { verifyIdentityToken } = require('../services/socialIdentity');

const SALT_ROUNDS = 12;

/** The message a password-less account gets when someone tries to sign in. */
const NO_PASSWORD = 'This account signs in with Google. Use the Google button.';

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

  // A Google account has no hash to compare against. Say so plainly rather
  // than "invalid password", which would send someone to reset a password they
  // never had. Register already discloses that an email is taken, so this
  // reveals nothing new.
  if (!user.passwordHash) {
    throw new AppError(401, NO_PASSWORD);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password');
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, user.tokenVersion);

  res.json({ user: serializeUser(user), accessToken, refreshToken });
}

/**
 * Finds the account a verified provider identity belongs to, creating one the
 * first time.
 *
 * Three cases, in order:
 *  1. We have seen this provider identity before. Sign that account in.
 *  2. We have not, but an account already holds the address the provider
 *     vouches for. Attach the identity to it, so signing in with Google
 *     reaches the account someone made with a password rather than a second,
 *     empty one under the same address.
 *  3. Neither. Make a new account.
 *
 * Case 2 is deliberately gated on the provider *vouching* for the address.
 * Attaching on an unverified email would hand anyone who can mint a token
 * naming an address they do not own the account that does.
 */
async function resolveSocialAccount(identity) {
  const key = {
    provider: identity.provider,
    providerUserId: identity.providerUserId,
  };

  const existing = await prisma.authIdentity.findUnique({
    where: { provider_providerUserId: key },
    include: { user: true },
  });
  if (existing) {
    return { user: existing.user, created: false };
  }

  if (!identity.email) {
    throw new AppError(400, 'That sign-in did not share an email address');
  }

  let user = identity.emailVerified
    ? await prisma.user.findUnique({ where: { email: identity.email } })
    : null;
  let created = false;

  if (user === null) {
    try {
      user = await prisma.user.create({
        data: {
          email: identity.email,
          // No password: this account is reached through the provider.
          passwordHash: null,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
      });
      created = true;
    } catch (err) {
      // Two first sign-ins landing at once, or an unverified address that turns
      // out to be taken. Either way the account exists now; use it.
      if (err.code !== 'P2002') throw err;
      user = await prisma.user.findUnique({ where: { email: identity.email } });
      if (!user) throw err;
    }
  } else if (identity.firstName && !user.firstName) {
    // Fill in a name the account never had. Never overwrite one the athlete
    // set themselves — their profile is theirs, not Google's.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { firstName: identity.firstName, lastName: identity.lastName },
    });
  }

  // Upsert rather than create so a double-tapped button is harmless.
  await prisma.authIdentity.upsert({
    where: { provider_providerUserId: key },
    create: { ...key, userId: user.id, email: identity.email },
    update: { email: identity.email },
  });

  return { user, created };
}

/**
 * Signs in with a provider ID token, issuing the same token pair as password
 * login so the client's session handling is identical either way.
 */
async function social(req, res) {
  const { provider, idToken } = req.body;

  const identity = await verifyIdentityToken(provider, idToken);
  const { user, created } = await resolveSocialAccount(identity);

  res.status(created ? 201 : 200).json({
    user: serializeUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id, user.tokenVersion),
    // Lets the app tell "welcome back" from "let's set up your profile"
    // without a second round trip. `onboardingCompleted` on the user is still
    // what decides where they land.
    isNewAccount: created,
  });
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

  // Nothing to change, and no current password to prove ownership with. Adding
  // a first password to a Google account needs its own flow, not this one.
  if (!user.passwordHash) {
    throw new AppError(400, 'This account has no password. It signs in with Google.');
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

module.exports = { register, login, social, refresh, me, changePassword, logout };
