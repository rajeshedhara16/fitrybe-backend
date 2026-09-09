const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../utils/validate');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  socialAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validators/authValidators');

const router = Router();

// Tighter limit on auth endpoints to slow down credential-stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter still than the rest of auth. Each request sends a real email to a
// real inbox, so this endpoint is both a spam vector aimed at other people and
// a way to probe which addresses have accounts.
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, validateBody(registerSchema), authController.register);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.post('/social', authLimiter, validateBody(socialAuthSchema), authController.social);
router.post('/forgot-password', resetLimiter, validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', resetLimiter, validateBody(resetPasswordSchema), authController.resetPassword);
router.post('/refresh', authLimiter, validateBody(refreshSchema), authController.refresh);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), authController.changePassword);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
