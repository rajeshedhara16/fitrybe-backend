const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Apple's token endpoints, used for one thing only: being able to revoke a
 * user's tokens when they delete their account.
 *
 * App Review guideline 5.1.1(v) requires it of any app that offers Sign in with
 * Apple, and revoking needs a token to revoke. Apple hands one over only in
 * exchange for the authorization code from a sign-in, which is why that code is
 * traded here at sign-in time and the result kept.
 *
 * Nothing else is done with these tokens. They are not used to read anything
 * from Apple or to act on anyone's behalf.
 */

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/**
 * The short-lived JWT that stands in for a client secret.
 *
 * Apple has no static secret. You sign one yourself with the .p8 key from the
 * developer portal, and it is valid for at most six months — minutes is plenty,
 * since it is used immediately and thrown away.
 */
function clientSecret() {
  return jwt.sign({}, env.apple.privateKey, {
    algorithm: 'ES256',
    keyid: env.apple.keyId,
    issuer: env.apple.teamId,
    audience: 'https://appleid.apple.com',
    subject: env.apple.bundleId,
    expiresIn: '5m',
  });
}

async function post(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Apple responded ${res.status}: ${text.slice(0, 200)}`);
  }
  // Revoke answers 200 with an empty body; the token endpoint answers JSON.
  return text ? JSON.parse(text) : {};
}

/** Whether the keys needed to talk to Apple's token endpoints are configured. */
function canRevoke() {
  return env.apple.canRevoke;
}

/**
 * Trades a sign-in's authorization code for a refresh token.
 *
 * Returns null rather than throwing: a sign-in must not fail because the thing
 * that only matters at deletion time did not work. The consequence of a null is
 * that the account cannot later be revoked automatically, which is worth
 * logging but not worth locking someone out over.
 */
async function exchangeAuthorizationCode(code) {
  if (!canRevoke() || !code) return null;

  try {
    const data = await post(APPLE_TOKEN_URL, {
      client_id: env.apple.bundleId,
      client_secret: clientSecret(),
      code,
      grant_type: 'authorization_code',
    });
    return data.refresh_token || null;
  } catch (err) {
    console.error('[fitrybe] Apple code exchange failed:', err.message);
    return null;
  }
}

/**
 * Revokes a token, ending Apple's side of the relationship.
 *
 * Returns whether it succeeded. The caller decides what to do about a failure;
 * deleting the account should not be blocked by Apple being unreachable, or the
 * user would be unable to leave.
 */
async function revokeToken(refreshToken) {
  if (!canRevoke() || !refreshToken) return false;

  try {
    await post(APPLE_REVOKE_URL, {
      client_id: env.apple.bundleId,
      client_secret: clientSecret(),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    return true;
  } catch (err) {
    console.error('[fitrybe] Apple token revocation failed:', err.message);
    return false;
  }
}

module.exports = { canRevoke, exchangeAuthorizationCode, revokeToken };
