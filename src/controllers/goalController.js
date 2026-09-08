const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * An athlete holds up to three goals — one daily, one weekly, one monthly —
 * each with its own activity, metric and target.
 *
 * Progress and streaks are worked out on the client, which is the only side
 * that knows the athlete's timezone. A session logged at 1am belongs to that
 * day where they live, and bucketing it here would put it on the wrong day for
 * anyone not on UTC.
 */
async function getGoal(req, res) {
  const goals = await prisma.userGoal.findMany({
    where: { userId: req.userId },
    orderBy: { period: 'asc' },
  });

  res.json({
    goals,
    // The weekly goal, kept under its old key so anything still reading a
    // single `goal` keeps working.
    goal: goals.find((g) => g.period === 'WEEKLY') || goals[0] || null,
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

  const normalisedPeriod = `${period}`.toUpperCase();
  if (!PERIODS.includes(normalisedPeriod)) {
    throw new AppError(400, 'A goal must be daily, weekly or monthly');
  }

  let computedTargetDistance = targetDistance;
  let computedTargetCalories = targetCalories;
  let computedTargetWorkouts = targetWorkouts;
  let computedTargetSteps = targetSteps;

  // `targetValue` plus `metric` and `unit` is what the client actually reads
  // back; the target* columns below are the older per-metric mirror, kept for
  // anything still reading them. A 'Duration' goal has no column here, which
  // costs nothing — nothing reads a duration target off this record.
  if (targetValue !== undefined && metric) {
    const val = parseFloat(targetValue);
    if (metric === 'Distance') {
      // 1 Mile = 1.60934 Km if unit is Miles
      computedTargetDistance = unit === 'Miles' ? parseFloat((val * 1.60934).toFixed(1)) : val;
    } else if (metric === 'Calories') {
      computedTargetCalories = Math.round(val);
    } else if (metric === 'Sessions') {
      computedTargetWorkouts = Math.round(val);
    }
  }

  // Keyed on the period, so saving a weekly goal never overwrites the daily
  // one. Previously any save replaced whichever goal happened to exist.
  const goal = await prisma.userGoal.upsert({
    where: {
      userId_period: { userId: req.userId, period: normalisedPeriod },
    },
    update: {
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
    create: {
      userId: req.userId,
      period: normalisedPeriod,
      activity: activity || 'Running',
      metric: metric || 'Distance',
      targetValue: targetValue !== undefined ? parseFloat(targetValue) : 50.0,
      unit: unit || 'Km',
      frequency: frequency || 'Weekly',
      targetSteps: computedTargetSteps || 10000,
      targetDistance: computedTargetDistance || 25.0,
      targetCalories: computedTargetCalories || 500,
      targetWorkouts: computedTargetWorkouts || 4,
    },
  });

  res.json({ goal });
}

/** Removes one period's goal, leaving the others in place. */
async function deleteGoal(req, res) {
  const period = `${req.params.period}`.toUpperCase();
  if (!PERIODS.includes(period)) {
    throw new AppError(400, 'A goal must be daily, weekly or monthly');
  }

  await prisma.userGoal.deleteMany({
    where: { userId: req.userId, period },
  });

  res.status(204).send();
}

module.exports = {
  getGoal,
  updateGoal,
  deleteGoal,
};
