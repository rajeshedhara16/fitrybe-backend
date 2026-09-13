const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const {
  ACTIVITIES_VISIBLE_TO_OTHERS,
  profileActivitiesVisible,
  canViewActivity,
} = require('../utils/visibility');

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
    isPublic,
    createPost = false,
  } = req.body;

  // Only the post audience needs the account read at logging time. Whether
  // anyone else sees this workout is decided when it is read, by the owner's
  // profile visibility, so it is stored public unless explicitly made private.
  const owner = createPost
    ? await prisma.user.findUnique({
        where: { id: req.userId },
        select: { defaultPostAudience: true },
      })
    : null;

  const visible = isPublic ?? true;

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
      isPublic: visible,
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
        // Follows the athlete's default rather than always going out to
        // everyone. Someone who posts to their Trybes by choice should not be
        // published wider by the share toggle on the recorder.
        audience: owner?.defaultPostAudience || 'EVERYONE',
        activityId: activity.id,
      },
    });
  }

  res.status(201).json({ activity });
}

async function listActivities(req, res) {
  const { userId, type, cursor, limit } = req.validatedQuery;

  // Asking for no one in particular means asking for yourself. This used to
  // fall through to every athlete's public activities, so the recorder's
  // "recent activities" list showed strangers' workouts.
  const targetUserId = userId || req.userId;
  const isSelf = targetUserId === req.userId;

  const whereClause = {
    userId: targetUserId,
    // Someone else's list holds only what they let others see, which takes
    // both the workout being public and their profile being visible.
    ...(isSelf ? {} : ACTIVITIES_VISIBLE_TO_OTHERS),
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

  // Don't confirm that a hidden activity exists to anyone but its owner,
  // whether it is hidden on its own or because its owner hid their profile.
  if (!(await canViewActivity(req.userId, activity))) {
    throw new AppError(404, 'Activity not found');
  }

  res.json({ activity });
}

/** How far back the analytics screen's calendars and heatmaps can be scrolled. */
const ANALYTICS_WINDOW_DAYS = 730;

/** The only fields the analytics screen reads off an activity. */
const ANALYTICS_SELECT = {
  id: true,
  type: true,
  title: true,
  duration: true,
  distance: true,
  calories: true,
  avgPace: true,
  createdAt: true,
};

async function getAnalytics(req, res) {
  const { userId } = req.validatedQuery;
  const targetUserId = userId || req.userId;
  const isSelf = targetUserId === req.userId;
  // Your own figures include everything you logged. Another athlete's come
  // from their public workouts, and from nothing at all if they hid their
  // profile, in which case every query below matches no rows and the reply
  // has the same zeroed shape as a brand new account's.
  const hidden = !isSelf && !(await profileActivitiesVisible(targetUserId));
  const scope = {
    userId: targetUserId,
    ...(isSelf ? {} : { isPublic: true }),
    ...(hidden ? { id: { in: [] } } : {}),
  };

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart = new Date(
    now.getTime() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [allTime, weekAgg, activities, perType] = await Promise.all([
    // Totals are summed by the database over every activity ever logged, so
    // they stay right however long the athlete has been training — and no
    // longer disagree with a truncated list.
    prisma.activity.aggregate({
      where: scope,
      _sum: { distance: true, duration: true, calories: true },
      _count: { _all: true },
    }),
    prisma.activity.aggregate({
      where: { ...scope, createdAt: { gte: sevenDaysAgo } },
      _sum: { distance: true, duration: true, calories: true },
      _count: { _all: true },
    }),
    // A date window, not a row count. `slice(0, 365)` meant 365 *activities*,
    // so someone training twice a day ran out of calendar after six months
    // while someone training weekly had seven years of it.
    //
    // `select` matters as much: this used to return every row in full,
    // including routeData. A few months of traced runs made this response
    // several megabytes to draw a screen that reads five fields per activity.
    prisma.activity.findMany({
      where: { ...scope, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: ANALYTICS_SELECT,
    }),
    // Personal bests, all-time and held separately per activity type — a yoga
    // session and a run should not compete for one "longest".
    prisma.activity.groupBy({
      by: ['type'],
      where: scope,
      _max: { distance: true, duration: true, calories: true },
      _min: { avgPace: true },
      _sum: { distance: true, duration: true },
      _count: { _all: true },
    }),
  ]);

  const totalDistanceMeters = allTime._sum.distance || 0;
  const totalDurationSecs = allTime._sum.duration || 0;
  const totalCalories = allTime._sum.calories || 0;
  const totalWorkouts = allTime._count._all;

  const weeklyDistanceKm = parseFloat(
    ((weekAgg._sum.distance || 0) / 1000).toFixed(2)
  );
  const weeklyDurationMins = Math.round((weekAgg._sum.duration || 0) / 60);
  const weeklyCalories = weekAgg._sum.calories || 0;

  const records = perType.map((row) => ({
    type: row.type,
    sessions: row._count._all,
    longestDistanceKm: parseFloat(((row._max.distance || 0) / 1000).toFixed(2)),
    longestDurationSecs: row._max.duration || 0,
    mostCalories: row._max.calories || 0,
    // A null pace means nothing in this type was distance-tracked.
    bestPace: row._min.avgPace,
    totalDistanceKm: parseFloat(((row._sum.distance || 0) / 1000).toFixed(2)),
    totalDurationSecs: row._sum.duration || 0,
  }));

  res.json({
    summary: {
      totalDistanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(2)),
      totalDurationHours: parseFloat((totalDurationSecs / 3600).toFixed(1)),
      totalCalories,
      totalWorkouts,
    },
    // A rolling seven days from now, in UTC — NOT the Monday-to-Sunday week the
    // app's goal rings and health figures use, and not the athlete's timezone
    // either. Kept for older builds; the current app counts its own week from
    // `recentActivities`, which is the only way the two agree on screen.
    weekly: {
      distanceKm: weeklyDistanceKm,
      durationMins: weeklyDurationMins,
      calories: weeklyCalories,
      workoutCount: weekAgg._count._all,
    },
    // Two years of activity, trimmed to the fields the screen reads. Keeps the
    // existing key so the calendar, heatmap, breakdown and trends carry on
    // working unchanged.
    recentActivities: activities,
    windowDays: ANALYTICS_WINDOW_DAYS,
    // All-time bests per activity type. Unlike the list above these are never
    // truncated, so a record cannot vanish once it ages out of the window.
    records,
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
