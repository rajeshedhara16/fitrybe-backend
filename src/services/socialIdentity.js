const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
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

const APPLE_ISSUER = 'https://appleid.apple.com';

// Apple rotates its signing keys, so they are fetched by key id and cached
// rather than pinned. `rateLimit` stops a flood of tokens naming key ids that
// do not exist from turning into a flood of requests to Apple.
const appleKeys = jwksClient({
  jwksUri: `${APPLE_ISSUER}/auth/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 12 * 60 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function appleSigningKey(header, callback) {
  appleKeys
    .getSigningKey(header.kid)
    .then((key) => callback(null, key.getPublicKey()))
    .catch(callback);
}

/**
 * Apple reports `email_verified` as either a boolean or the *string* "true",
 * depending on the flow. Reading it as a boolean alone quietly treats every
 * verified address as unverified, which would stop Apple sign-ins ever
 * attaching to an account someone already has.
 */
function appleClaimIsTrue(value) {
  return value === true || value === 'true';
}

async function verifyAppleIdToken(idToken) {
  if (!env.apple.enabled) {
    throw new AppError(503, 'Sign in with Apple is not configured on this server');
  }

  let payload;
  try {
    payload = await new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        appleSigningKey,
        {
          algorithms: ['RS256'],
          issuer: APPLE_ISSUER,
          audience: env.apple.audiences,
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
    });
  } catch (err) {
    throw new AppError(401, 'Apple could not verify that sign-in');
  }

  if (!payload || !payload.sub) {
    throw new AppError(401, 'Apple could not verify that sign-in');
  }

  return {
    provider: 'APPLE',
    providerUserId: payload.sub,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    emailVerified: appleClaimIsTrue(payload.email_verified),
    // Apple puts no name in the token. It hands the name to the app once, on
    // the very first authorization, and never again — so the app sends it up
    // separately and the controller uses it only to fill a blank.
    firstName: null,
    lastName: null,
  };
}

/** Verifies [idToken] against [provider], or refuses a provider we cannot check. */
function verifyIdentityToken(provider, idToken) {
  switch (provider) {
    case 'GOOGLE':
      return verifyGoogleIdToken(idToken);
    case 'APPLE':
      return verifyAppleIdToken(idToken);
    default:
      throw new AppError(400, `Unsupported sign-in provider: ${provider}`);
  }
}

module.exports = { verifyIdentityToken, verifyGoogleIdToken, verifyAppleIdToken };
