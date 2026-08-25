const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const { unlockAchievementSchema } = require('../validators/achievementValidators');
const { getUserAchievements, unlockAchievement } = require('../controllers/achievementController');

const router = express.Router();

router.use(requireAuth);

router.get('/', getUserAchievements);
router.post('/unlock', validate({ body: unlockAchievementSchema }), unlockAchievement);

module.exports = router;
