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

  res.json({
    totalCount: 37,
    unlockedCount: unlockedList.length,
    unlockedRatio: parseFloat((unlockedList.length / 37).toFixed(2)),
    unlockedMap,
    achievements: unlockedList,
  });
}

async function unlockAchievement(req, res) {
  const userId = req.userId;
  const { achievementId } = req.body;

  const achievement = await prisma.userAchievement.upsert({
    where: {
      userId_achievementId: {
        userId,
        achievementId,
      },
    },
    update: {
      unlockedAt: new Date(),
    },
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
