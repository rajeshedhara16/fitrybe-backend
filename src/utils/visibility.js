const prisma = require('../config/prisma');

/** Trybe ids the viewer belongs to, used for both post and Trybe visibility. */
async function trybeIdsFor(viewerId) {
  const memberships = await prisma.trybeMember.findMany({
    where: { userId: viewerId },
    select: { trybeId: true },
  });
  return memberships.map((m) => m.trybeId);
}

/**
 * Prisma `where` fragment restricting posts to what the viewer may see.
 *
 * `PostAudience.TRYBES` means "my Trybes only": the post reaches its author
 * and anyone who shares at least one Trybe with them. An `EVERYONE` post is
 * unrestricted. Callers must AND this with their own filters rather than
 * merging keys, so a caller-supplied `OR` cannot overwrite it.
 */
async function postVisibilityFilter(viewerId) {
  const trybeIds = await trybeIdsFor(viewerId);

  return {
    OR: [
      { audience: 'EVERYONE' },
      { authorId: viewerId },
      {
        audience: 'TRYBES',
        // An empty `in` matches nothing, which is the right answer for a
        // viewer who has not joined any Trybe yet.
        author: { trybeMembers: { some: { trybeId: { in: trybeIds } } } },
      },
    ],
  };
}

/** Single-post form of [postVisibilityFilter]. */
async function canViewPost(viewerId, post) {
  if (!post) return false;
  if (post.authorId === viewerId) return true;
  if (post.audience !== 'TRYBES') return true;

  const shared = await prisma.trybeMember.findFirst({
    where: {
      userId: post.authorId,
      trybe: { members: { some: { userId: viewerId } } },
    },
    select: { id: true },
  });
  return !!shared;
}

/**
 * What another person may see of someone's workouts: public ones, and only
 * while the owner's profile is visible at all.
 *
 * Checked at read time rather than written onto each workout. Hiding a profile
 * therefore covers its whole history, and showing it again restores exactly
 * what was visible before, individually private workouts included, because
 * nothing stored was ever changed.
 *
 * For queries about someone other than the viewer. A viewer's own workouts are
 * never filtered.
 */
const ACTIVITIES_VISIBLE_TO_OTHERS = Object.freeze({
  isPublic: true,
  user: { activitiesVisible: true },
});

/** Whether the owner lets anyone else see their workouts at all. */
async function profileActivitiesVisible(userId) {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { activitiesVisible: true },
  });
  return owner?.activitiesVisible !== false;
}

/** Single-workout form of [ACTIVITIES_VISIBLE_TO_OTHERS]. */
async function canViewActivity(viewerId, activity) {
  if (!activity) return false;
  if (activity.userId === viewerId) return true;
  if (!activity.isPublic) return false;
  return profileActivitiesVisible(activity.userId);
}

module.exports = {
  trybeIdsFor,
  postVisibilityFilter,
  canViewPost,
  ACTIVITIES_VISIBLE_TO_OTHERS,
  profileActivitiesVisible,
  canViewActivity,
};
