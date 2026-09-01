const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(userId) {
  return jwt.sign({ sub: userId, type: 'access' }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

/**
 * `tokenVersion` is stamped into the token and re-checked on refresh, so
 * bumping the column on the user revokes every refresh token issued before
 * that point — which is what makes logout and password change end sessions.
 */
function signRefreshToken(userId, tokenVersion = 0) {
  return jwt.sign(
    { sub: userId, type: 'refresh', ver: tokenVersion },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
