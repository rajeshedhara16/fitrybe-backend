const { z } = require('zod');

const unlockAchievementSchema = z.object({
  achievementId: z.string().min(1, 'achievementId is required'),
});

module.exports = { unlockAchievementSchema };
