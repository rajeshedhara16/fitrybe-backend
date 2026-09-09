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
const mailer = require('../services/mailer');
const appleTokens = require('../services/appleTokens');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

/** How long a reset code stays good for. Long enough to find the email. */
const RESET_TTL_MINUTES = 15;

/** Wrong guesses a single code tolerates before it is burned. */
const RESET_MAX_ATTEMPTS = 5;

const PROVIDER_NAMES = { GOOGLE: 'Google', APPLE: 'Apple' };

/**
 * What to tell someone whose account has no password.
 *
 * Names the buttons that will actually work for them rather than guessing at
 * one, so an Apple user is not sent looking for a Google button.
 */
async function noPasswordMessage(userId) {
  const identities = await prisma.authIdentity.findMany({
    where: { userId },
    select: { provider: true },
  });

  const names = [
    ...new Set(identities.map((i) => PROVIDER_NAMES[i.provider] || i.provider)),
  ];
  if (names.length === 0) {
    return 'This account has no password set.';
  }
  return `This account signs in with ${names.join(' or ')}. Use that button.`;
}

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

  // An account reached through a provider has no hash to compare against. Say
  // so plainly rather than "invalid password", which would send someone to
  // reset a password they never had. Register already discloses that an email
  // is taken, so naming the provider reveals nothing new.
  if (!user.passwordHash) {
    throw new AppError(401, await noPasswordMessage(user.id));
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
 *     vouches for. Attach the identity to it, so signing in with a provider
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
    // set themselves — their profile is theirs, not the provider's.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { firstName: identity.firstName, lastName: identity.lastName },
    });
  }

  // Upsert rather than create so a double-tapped button is harmless. A null
  // refresh token is never written over a good one: a later sign-in that
  // produced none must not destroy the only means of revoking the account.
  const refreshToken = identity.refreshToken || undefined;
  await prisma.authIdentity.upsert({
    where: { provider_providerUserId: key },
    create: {
      ...key,
      userId: user.id,
      email: identity.email,
      providerRefreshToken: identity.refreshToken || null,
    },
    update: { email: identity.email, providerRefreshToken: refreshToken },
  });

  return { user, created };
}

/**
 * Signs in with a provider ID token, issuing the same token pair as password
 * login so the client's session handling is identical either way.
 */
async function social(req, res) {
  const { provider, idToken, firstName, lastName, authorizationCode } = req.body;

  const identity = await verifyIdentityToken(provider, idToken);

  // Apple carries no name in its token and volunteers one exactly once, on the
  // first authorization, so the app passes it alongside. Only ever consulted
  // when the verified token itself said nothing, and even then it does no more
  // than fill a blank on a new account.
  identity.firstName = identity.firstName || firstName || null;
  identity.lastName = identity.lastName || lastName || null;

  // Apple's authorization code is worth a refresh token, and a refresh token is
  // the only thing that can later be revoked. Exchanged now because the code is
  // single-use and expires in minutes; it will not still be there at deletion
  // time. Returns null on any failure, which must not fail the sign-in.
  if (provider === 'APPLE' && authorizationCode) {
    identity.refreshToken =
        await appleTokens.exchangeAuthorizationCode(authorizationCode);
  }

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

/**
 * A six-digit code, drawn from the OS random source rather than Math.random.
 *
 * `randomInt` is uniform over the range; the usual `floor(random() * n)` on a
 * predictable generator is not, and this code is the only thing standing
 * between an email inbox and someone's account.
 */
function generateResetCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Emails a one-time code to whoever owns the address.
 *
 * Always answers the same way, whether or not the address belongs to an
 * account. Anything else turns this endpoint into a way to ask "is this person
 * a member?" and get an answer, which is a privacy leak on a fitness app where
 * membership is not public.
 *
 * The one exception is a server with no mail configured, which reports itself
 * unavailable. That answer is identical for every address, so it discloses
 * nothing about any of them.
 */
async function forgotPassword(req, res) {
  if (!mailer.canSend()) {
    throw new AppError(503, 'Password reset is unavailable right now');
  }

  const email = `${req.body.email}`.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const code = generateResetCode();

    // Only one live code per account: requesting a second invalidates the
    // first, so an old email cannot be used after a newer one is sent.
    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, SALT_ROUNDS),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    // Send email asynchronously in background so SMTP socket delays never
    // block the HTTP response or cause client timeouts.
    mailer.sendPasswordResetCode({
      to: user.email,
      code,
      minutes: RESET_TTL_MINUTES,
    }).catch((err) => {
      console.error('[fitrybe] password reset email failed:', err.message);
    });
  }

  res.json({
    success: true,
    message: `If that email has an account, a reset code is on its way. It expires in ${RESET_TTL_MINUTES} minutes.`,
    expiresInMinutes: RESET_TTL_MINUTES,
  });
}

/**
 * Spends a code and sets a new password.
 *
 * Every failure answers with the same message. Distinguishing "no such account"
 * from "wrong code" would hand an attacker the account list for free.
 *
 * Works on an account that never had a password — one made through Google or
 * Apple. Controlling the address is exactly what a reset proves, and it is the
 * only way such an account can gain a password at all.
 */
async function resetPassword(req, res) {
  const email = `${req.body.email}`.trim().toLowerCase();
  const { code, newPassword } = req.body;
  const invalid = new AppError(400, 'That code is wrong or has expired');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw invalid;

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!reset || reset.attempts >= RESET_MAX_ATTEMPTS) throw invalid;

  if (!(await bcrypt.compare(code, reset.codeHash))) {
    // Six digits is only a million wide, so the cap is what actually protects
    // it. Counted before answering, so a burst of guesses cannot outrun it.
    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalid;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // One transaction: the code is spent and the password replaced together, so a
  // failure halfway cannot leave a used code with the old password still set.
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // Whoever asked for this may be locked out precisely because someone else
      // is signed in. Bumping the version ends every other session.
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Signed straight in on this device, having just proved both the address and
  // the new password.
  res.json({
    user: serializeUser(updated),
    accessToken: signAccessToken(updated.id),
    refreshToken: signRefreshToken(updated.id, updated.tokenVersion),
  });
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
    throw new AppError(400, await noPasswordMessage(user.id));
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

module.exports = {
  register,
  login,
  social,
  forgotPassword,
  resetPassword,
  refresh,
  me,
  changePassword,
  logout,
};
