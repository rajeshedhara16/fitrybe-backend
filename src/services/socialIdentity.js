const { OAuth2Client } = require('google-auth-library');
const AppError = require('../utils/AppError');
const env = require('../config/env');

/**
 * Turns a provider's ID token into an identity this server is willing to
 * believe.
 *
 * The app is not trusted for any of this. It sends the token exactly as the
 * provider minted it; the signature is checked here against the provider's own
 * published keys, and only the claims inside that verified token are used. An
 * email or user id sent alongside it would be worth nothing.
 */

// No client id or secret: verifying a token needs neither, only the audience
// to check it against. Reused across requests so Google's public keys are
// fetched once and cached rather than on every sign-in.
const googleClient = new OAuth2Client();

async function verifyGoogleIdToken(idToken) {
  if (!env.google.enabled) {
    throw new AppError(503, 'Google sign-in is not configured on this server');
  }

  let payload;
  try {
    // Checks the signature, the issuer, the expiry, and that the token was
    // minted for one of this app's own clients.
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.google.audiences,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw new AppError(401, 'Google could not verify that sign-in');
  }

  if (!payload || !payload.sub) {
    throw new AppError(401, 'Google could not verify that sign-in');
  }

  return {
    provider: 'GOOGLE',
    providerUserId: payload.sub,
    email: payload.email ? payload.email.trim().toLowerCase() : null,
    // Whether Google vouches for the address. Only a vouched-for address may
    // be attached to an account that already exists.
    emailVerified: payload.email_verified === true,
    firstName: payload.given_name || null,
    lastName: payload.family_name || null,
  };
}

/** Verifies [idToken] against [provider], or refuses a provider we cannot check. */
function verifyIdentityToken(provider, idToken) {
  switch (provider) {
    case 'GOOGLE':
      return verifyGoogleIdToken(idToken);
    default:
      throw new AppError(400, `Unsupported sign-in provider: ${provider}`);
  }
}

module.exports = { verifyIdentityToken, verifyGoogleIdToken };
