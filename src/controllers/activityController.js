const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

async function logActivity(req, res) {
  const {
    title,
    type = 'Run',
    duration,
    distance,
    calories = 0,
    avgPace,
    maxSpeed,
    elevationGain = 0,
    routeData,
    startTime,
    endTime,
    isPublic = true,
    createPost = false,
  } = req.body;

  // Compute avgPace (min/km) if distance > 0 and not provided
  let computedPace = avgPace;
  if (!computedPace && distance > 0) {
    const distanceKm = distance / 1000;
    const durationMins = duration / 60;
    computedPace = parseFloat((durationMins / distanceKm).toFixed(2));
  }

  const activity = await prisma.activity.create({
    data: {
      userId: req.userId,
      title,
      type,
      duration,
      distance,
      calories,
      avgPace: computedPace,
      maxSpeed,
      elevationGain,
      routeData,
      startTime: startTime || new Date(),
      endTime,
      isPublic,
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  // Optionally create a social post for this activity
  if (createPost) {
    const distanceKm = (distance / 1000).toFixed(2);
    const durationMins = Math.round(duration / 60);
    const caption = `Completed a ${distanceKm} km ${type.toLowerCase()} in ${durationMins} mins! 🏃‍♂️⚡`;

    await prisma.post.create({
      data: {
        authorId: req.userId,
        caption,
        type: 'Activity',
        audience: 'EVERYONE',
        activityId: activity.id,
      },
    });
  }

  res.status(201).json({ activity });
}

async function listActivities(req, res) {
  const { userId, type, cursor, limit } = req.validatedQuery;

  const whereClause = {
    ...(userId ? { userId } : { isPublic: true }),
    ...(type ? { type } : {}),
  };

  const activities = await prisma.activity.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const nextCursor = activities.length === limit ? activities[activities.length - 1].id : null;

  res.json({ activities, nextCursor });
}

async function getActivity(req, res) {
  const activity = await prisma.activity.findUnique({
    where: { id: req.params.activityId },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  if (!activity) {
    throw new AppError(404, 'Activity not found');
  }

  res.json({ activity });
}

async function getAnalytics(req, res) {
  const targetUserId = req.query.userId || req.userId;

  const userActivities = await prisma.activity.findMany({
    where: { userId: targetUserId },
    orderBy: { createdAt: 'desc' },
  });

  const totalDistanceMeters = userActivities.reduce((acc, curr) => acc + (curr.distance || 0), 0);
  const totalDurationSecs = userActivities.reduce((acc, curr) => acc + (curr.duration || 0), 0);
  const totalCalories = userActivities.reduce((acc, curr) => acc + (curr.calories || 0), 0);
  const totalWorkouts = userActivities.length;

  // Calculate weekly breakdown (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentActivities = userActivities.filter(a => new Date(a.createdAt) >= sevenDaysAgo);

  const weeklyDistanceKm = parseFloat((recentActivities.reduce((acc, curr) => acc + curr.distance, 0) / 1000).toFixed(2));
  const weeklyDurationMins = Math.round(recentActivities.reduce((acc, curr) => acc + curr.duration, 0) / 60);
  const weeklyCalories = recentActivities.reduce((acc, curr) => acc + (curr.calories || 0), 0);

  res.json({
    summary: {
      totalDistanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(2)),
      totalDurationHours: parseFloat((totalDurationSecs / 3600).toFixed(1)),
      totalCalories,
      totalWorkouts,
    },
    weekly: {
      distanceKm: weeklyDistanceKm,
      durationMins: weeklyDurationMins,
      calories: weeklyCalories,
      workoutCount: recentActivities.length,
    },
    // The analytics screen builds month calendars, streak heatmaps and
    // personal records from this list, so it needs more than a short preview.
    recentActivities: userActivities.slice(0, 365),
  });
}

async function deleteActivity(req, res) {
  const activity = await prisma.activity.findUnique({ where: { id: req.params.activityId } });
  if (!activity) {
    throw new AppError(404, 'Activity not found');
  }
  if (activity.userId !== req.userId) {
    throw new AppError(403, 'You can only delete your own activities');
  }

  await prisma.activity.delete({ where: { id: activity.id } });
  res.status(204).send();
}

module.exports = {
  logActivity,
  listActivities,
  getActivity,
  getAnalytics,
  deleteActivity,
};
