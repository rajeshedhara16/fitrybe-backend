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

module.exports = { trybeIdsFor, postVisibilityFilter, canViewPost };
