const prisma = require('../config/prisma');

async function getUserAchievements(req, res) {
  const userId = req.userId;

  const unlockedList = await prisma.userAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: 'desc' },
  });

  const unlockedMap = {};
  for (const item of unlockedList) {
    unlockedMap[item.achievementId] = item.unlockedAt;
  }

  // The badge catalogue (artwork, thresholds, how many exist) lives in the
  // client's AchievementData, so the server reports only what it actually
  // knows: which ids this athlete has unlocked, and when.
  res.json({
    unlockedCount: unlockedList.length,
    unlockedMap,
    achievements: unlockedList,
  });
}

async function unlockAchievement(req, res) {
  const userId = req.userId;
  const { achievementId } = req.body;

  // Re-unlocking is a no-op: the original `unlockedAt` is the date the athlete
  // earned the badge, and rewriting it made every badge appear earned today.
  const achievement = await prisma.userAchievement.upsert({
    where: {
      userId_achievementId: {
        userId,
        achievementId,
      },
    },
    update: {},
    create: {
      userId,
      achievementId,
    },
  });

  res.status(201).json({
    message: 'Achievement unlocked successfully',
    achievement,
  });
}

module.exports = {
  getUserAchievements,
  unlockAchievement,
};
