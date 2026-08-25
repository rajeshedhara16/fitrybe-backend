const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Missing or malformed Authorization header');
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') {
      throw new Error('Wrong token type');
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    throw new AppError(401, 'Invalid or expired token');
  }
}

module.exports = { requireAuth };
