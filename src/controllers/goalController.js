const prisma = require('../config/prisma');

async function getGoal(req, res) {
  let goal = await prisma.userGoal.findFirst({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
  });

  // Calculate current progress
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());

  const activities = await prisma.activity.findMany({
    where: {
      userId: req.userId,
      createdAt: { gte: startOfWeek },
    },
  });

  const currentDistanceKm = parseFloat(
    (activities.reduce((acc, a) => acc + (a.distance || 0), 0) / 1000).toFixed(2)
  );
  const currentCalories = activities.reduce((acc, a) => acc + (a.calories || 0), 0);
  const currentWorkouts = activities.length;

  res.json({
    goal: goal || null,
    progress: {
      distanceKm: currentDistanceKm,
      calories: currentCalories,
      workouts: currentWorkouts,
      distancePercentage: goal ? Math.min(100, Math.round((currentDistanceKm / (goal.targetDistance || 1)) * 100)) : 0,
      caloriesPercentage: goal ? Math.min(100, Math.round((currentCalories / (goal.targetCalories || 1)) * 100)) : 0,
      workoutsPercentage: goal ? Math.min(100, Math.round((currentWorkouts / (goal.targetWorkouts || 1)) * 100)) : 0,
    },
  });
}

async function updateGoal(req, res) {
  const {
    activity,
    metric,
    targetValue,
    unit,
    frequency,
    period = 'WEEKLY',
    targetSteps,
    targetDistance,
    targetCalories,
    targetWorkouts,
  } = req.body;

  let computedTargetDistance = targetDistance;
  let computedTargetCalories = targetCalories;
  let computedTargetWorkouts = targetWorkouts;
  let computedTargetSteps = targetSteps;

  if (targetValue !== undefined && metric) {
    const val = parseFloat(targetValue);
    if (metric === 'Distance') {
      // 1 Mile = 1.60934 Km if unit is Miles
      computedTargetDistance = unit === 'Miles' ? parseFloat((val * 1.60934).toFixed(1)) : val;
    } else if (metric === 'Calories') {
      computedTargetCalories = Math.round(val);
    } else if (metric === 'Sessions') {
      computedTargetWorkouts = Math.round(val);
    } else if (metric === 'Steps') {
      computedTargetSteps = Math.round(val);
    }
  }

  const existing = await prisma.userGoal.findFirst({
    where: { userId: req.userId },
  });

  let goal;
  if (existing) {
    goal = await prisma.userGoal.update({
      where: { id: existing.id },
      data: {
        period,
        ...(activity && { activity }),
        ...(metric && { metric }),
        ...(targetValue !== undefined && { targetValue: parseFloat(targetValue) }),
        ...(unit && { unit }),
        ...(frequency && { frequency }),
        ...(computedTargetSteps !== undefined && { targetSteps: computedTargetSteps }),
        ...(computedTargetDistance !== undefined && { targetDistance: computedTargetDistance }),
        ...(computedTargetCalories !== undefined && { targetCalories: computedTargetCalories }),
        ...(computedTargetWorkouts !== undefined && { targetWorkouts: computedTargetWorkouts }),
      },
    });
  } else {
    goal = await prisma.userGoal.create({
      data: {
        userId: req.userId,
        period,
        activity: activity || 'Running',
        metric: metric || 'Distance',
        targetValue: targetValue !== undefined ? parseFloat(targetValue) : 50.0,
        unit: unit || 'Miles',
        frequency: frequency || 'Weekly',
        targetSteps: computedTargetSteps || 10000,
        targetDistance: computedTargetDistance || 25.0,
        targetCalories: computedTargetCalories || 500,
        targetWorkouts: computedTargetWorkouts || 4,
      },
    });
  }

  res.json({ goal });
}

module.exports = {
  getGoal,
  updateGoal,
};
