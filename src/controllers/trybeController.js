const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { deleteByUrls } = require('../services/storage');
const { createNotification } = require('../utils/notify');
const { postVisibilityFilter } = require('../utils/visibility');
const { serializePost, POST_INCLUDE } = require('./postController');

/** Roles that run a Trybe day to day: edit it, schedule events, remove members. */
const MANAGERS = ['CREATOR', 'CAPTAIN'];
const EVERY_ROLE = ['CREATOR', 'CAPTAIN', 'MEMBER'];
const ROLE_ORDER = { CREATOR: 0, CAPTAIN: 1, MEMBER: 2 };

/** An event with no end time still counts as happening for this long. */
const EVENT_GRACE_MS = 2 * 60 * 60 * 1000;

const USER_CARD = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true },
};

/** Loads the caller's membership row, or null when they are not a member. */
function membershipOf(trybeId, userId) {
  return prisma.trybeMember.findUnique({
    where: { trybeId_userId: { trybeId, userId } },
    select: { id: true, role: true, notificationsMuted: true },
  });
}

/**
 * The Trybe, the caller's membership and their role in it, or a 404.
 *
 * A private Trybe answers "not found" to outsiders on every route, so its
 * existence is never confirmed to someone who could not see it anyway.
 */
async function loadTrybe(trybeId, userId) {
  const trybe = await prisma.trybe.findUnique({ where: { id: trybeId } });
  if (!trybe) throw new AppError(404, 'Trybe not found');

  const membership = await membershipOf(trybeId, userId);
  const isCreator = trybe.creatorId === userId;
  if (!trybe.isPublic && !isCreator && !membership) {
    throw new AppError(404, 'Trybe not found');
  }

  const role = isCreator ? 'CREATOR' : membership ? membership.role : null;
  return { trybe, membership, role };
}

function requireRole(ctx, allowed, message) {
  if (!allowed.includes(ctx.role)) throw new AppError(403, message);
}

/**
 * Prisma fragment hiding private Trybes from people who have not joined them.
 * `isPublic` is a declared access control, so it has to be applied on every
 * read path rather than only in the UI.
 */
function trybeVisibilityFilter(viewerId) {
  return {
    OR: [
      { isPublic: true },
      { creatorId: viewerId },
      { members: { some: { userId: viewerId } } },
    ],
  };
}

const TRYBE_INCLUDE = {
  creator: USER_CARD,
  _count: { select: { members: true } },
};

/** The caller's own membership row, for isMember, role and mute state. */
function myMembership(userId) {
  return userId
    ? { where: { userId }, select: { userId: true, role: true, notificationsMuted: true } }
    : false;
}

function serializeTrybe(trybe, userId) {
  const { _count, members, ...rest } = trybe;
  const mine = Array.isArray(members)
    ? members.find((m) => m.userId === userId)
    : undefined;
  const myRole = trybe.creatorId === userId ? 'CREATOR' : mine ? mine.role : null;
  return {
    ...rest,
    memberCount: _count ? _count.members : 0,
    isMember: !!mine,
    myRole,
    canManage: MANAGERS.includes(myRole),
    notificationsMuted: mine ? mine.notificationsMuted : false,
  };
}

/**
 * Sends one notification to every member who has not muted the Trybe, except
 * the person who caused it. Muting is checked here, at the source, so a muted
 * member is never notified rather than notified and filtered later.
 */
async function notifyTrybeMembers(trybe, actorId, { type, title, body }) {
  const recipients = await prisma.trybeMember.findMany({
    where: { trybeId: trybe.id, userId: { not: actorId }, notificationsMuted: false },
    select: { userId: true },
  });
  for (const r of recipients) {
    await createNotification({
      recipientId: r.userId,
      actorId,
      type,
      title,
      body,
      entityId: trybe.id,
    });
  }
  return recipients.length;
}

/**
 * Takes someone out of a Trybe along with what only made sense while they were
 * in it: their RSVPs to its events and their seat in its group chat.
 */
async function removeMembership(trybeId, userId) {
  await prisma.$transaction([
    prisma.trybeEventRsvp.deleteMany({ where: { userId, event: { trybeId } } }),
    prisma.conversationMember.deleteMany({ where: { userId, conversation: { trybeId } } }),
    prisma.trybeMember.deleteMany({ where: { trybeId, userId } }),
  ]);
}

// ── Trybes ──────────────────────────────────────────────────────────────────

async function listTrybes(req, res) {
  const { cursor, limit, mine, category, search } = req.validatedQuery || req.query;
  const takeLimit = parseInt(limit || 20, 10);

  // ANDed so the caller's `search` OR cannot displace the visibility rule.
  const whereClause = {
    AND: [
      trybeVisibilityFilter(req.userId),
      {
        ...(mine ? { members: { some: { userId: req.userId } } } : {}),
        ...(category
          ? { category: { equals: category, mode: 'insensitive' } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    ],
  };

  const trybes = await prisma.trybe.findMany({
    take: takeLimit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: { ...TRYBE_INCLUDE, members: myMembership(req.userId) },
  });

  const nextCursor = trybes.length === takeLimit ? trybes[trybes.length - 1].id : null;

  res.json({ trybes: trybes.map((t) => serializeTrybe(t, req.userId)), nextCursor });
}

async function createTrybe(req, res) {
  const imageUrl = req.uploads?.[0]?.url;

  const trybe = await prisma.trybe.create({
    data: {
      ...req.body,
      imageUrl,
      creatorId: req.userId,
      members: {
        create: { userId: req.userId, role: 'CREATOR' },
      },
    },
    include: { ...TRYBE_INCLUDE, members: myMembership(req.userId) },
  });

  res.status(201).json({ trybe: serializeTrybe(trybe, req.userId) });
}

async function getTrybe(req, res) {
  await loadTrybe(req.params.trybeId, req.userId);
  const trybe = await prisma.trybe.findUnique({
    where: { id: req.params.trybeId },
    include: { ...TRYBE_INCLUDE, members: myMembership(req.userId) },
  });
  res.json({ trybe: serializeTrybe(trybe, req.userId) });
}

/**
 * Edits a Trybe. The creator and captains can change its details and weekly
 * goal. Only the creator can change who is allowed in, since making a private
 * Trybe public exposes everyone who joined on that understanding.
 */
async function updateTrybe(req, res) {
  const uploaded = req.uploads?.[0]?.url;
  try {
    const ctx = await loadTrybe(req.params.trybeId, req.userId);
    requireRole(ctx, MANAGERS, 'Only the creator and captains can edit this Trybe');

    const { removeImage, ...fields } = req.body;
    if (fields.isPublic !== undefined && fields.isPublic !== ctx.trybe.isPublic && ctx.role !== 'CREATOR') {
      throw new AppError(403, 'Only the creator can change who can join this Trybe');
    }

    const data = {};
    for (const key of [
      'name',
      'description',
      'isPublic',
      'category',
      'location',
      'activityInterests',
      'weeklyGoalKm',
    ]) {
      if (fields[key] !== undefined) data[key] = fields[key];
    }
    if (uploaded) data.imageUrl = uploaded;
    else if (removeImage) data.imageUrl = null;

    const updated = await prisma.trybe.update({
      where: { id: ctx.trybe.id },
      data,
      include: { ...TRYBE_INCLUDE, members: myMembership(req.userId) },
    });

    // The old photo is only removed once nothing points at it any more.
    if (ctx.trybe.imageUrl && ctx.trybe.imageUrl !== updated.imageUrl) {
      await deleteByUrls(ctx.trybe.imageUrl);
    }

    res.json({ trybe: serializeTrybe(updated, req.userId) });
  } catch (err) {
    // A refused edit must not leave its upload sitting in the bucket.
    if (uploaded) await deleteByUrls(uploaded);
    throw err;
  }
}

async function deleteTrybe(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  requireRole(ctx, ['CREATOR'], 'Only the creator can delete this Trybe');

  await prisma.$transaction([
    // Invites and event notices would otherwise point at nothing.
    prisma.notification.deleteMany({
      where: { entityId: ctx.trybe.id, type: { in: ['TRYBE_INVITE', 'TRYBE_EVENT'] } },
    }),
    prisma.trybe.delete({ where: { id: ctx.trybe.id } }),
  ]);
  await deleteByUrls(ctx.trybe.imageUrl);
  res.status(204).send();
}

// ── Members ─────────────────────────────────────────────────────────────────

/**
 * The roster, creator first and then captains, with whether the caller already
 * follows each person. Without that, every Follow button started as "Follow",
 * including for people the caller had followed long ago.
 */
async function listMembers(req, res) {
  await loadTrybe(req.params.trybeId, req.userId);

  const members = await prisma.trybeMember.findMany({
    where: { trybeId: req.params.trybeId },
    orderBy: { joinedAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          bio: true,
          location: true,
        },
      },
    },
  });

  const follows = await prisma.follow.findMany({
    where: { followerId: req.userId, followingId: { in: members.map((m) => m.userId) } },
    select: { followingId: true },
  });
  const followed = new Set(follows.map((f) => f.followingId));

  const roster = members
    .map(({ notificationsMuted, ...m }) => ({ ...m, isFollowing: followed.has(m.userId) }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  res.json({ members: roster });
}

/** Appoints or stands down a captain. Only the creator can do this. */
async function setMemberRole(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  requireRole(ctx, ['CREATOR'], 'Only the creator can appoint captains');

  const target = await membershipOf(ctx.trybe.id, req.params.userId);
  if (!target) throw new AppError(404, 'That athlete is not in this Trybe');
  if (target.role === 'CREATOR') {
    throw new AppError(400, "The creator's role cannot be changed");
  }

  const updated = await prisma.trybeMember.update({
    where: { id: target.id },
    data: { role: req.body.role },
  });
  res.json({ userId: req.params.userId, role: updated.role });
}

/**
 * Removes someone from a Trybe. The creator can remove anyone else. Captains
 * can remove members but not other captains, so a captain cannot quietly strip
 * the Trybe of its other organisers.
 */
async function removeMember(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  requireRole(ctx, MANAGERS, 'Only the creator and captains can remove members');

  const targetId = req.params.userId;
  if (targetId === req.userId) {
    throw new AppError(400, 'To leave, use Leave Trybe instead');
  }
  const target = await membershipOf(ctx.trybe.id, targetId);
  if (!target) throw new AppError(404, 'That athlete is not in this Trybe');
  if (target.role === 'CREATOR') {
    throw new AppError(403, 'The creator cannot be removed');
  }
  if (target.role === 'CAPTAIN' && ctx.role !== 'CREATOR') {
    throw new AppError(403, 'Only the creator can remove a captain');
  }

  await removeMembership(ctx.trybe.id, targetId);
  res.status(204).send();
}

async function setMuted(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  if (!ctx.membership) {
    throw new AppError(403, "Join this Trybe to change its notifications");
  }
  await prisma.trybeMember.update({
    where: { id: ctx.membership.id },
    data: { notificationsMuted: req.body.muted },
  });
  res.json({ muted: req.body.muted });
}

// ── Leaderboard and feeds ───────────────────────────────────────────────────

/**
 * Members ranked by distance since a point in time, or all time without one.
 * The client sends the start of its own week or month, since only it knows the
 * athlete's timezone. The total is what the weekly goal measures.
 */
async function getLeaderboard(req, res) {
  const { trybeId } = req.params;
  const { since } = req.validatedQuery || {};
  await loadTrybe(trybeId, req.userId);

  const members = await prisma.trybeMember.findMany({
    where: { trybeId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          activitiesVisible: true,
          activities: {
            ...(since ? { where: { createdAt: { gte: since } } } : {}),
            select: { distance: true, duration: true, calories: true, isPublic: true },
          },
        },
      },
    },
  });

  let totalMeters = 0;
  const leaderboard = members.map((m) => {
    // Your own row counts everything you logged. Anyone else's counts only
    // what they let others see.
    const counted =
      m.user.id === req.userId
        ? m.user.activities
        : m.user.activitiesVisible
          ? m.user.activities.filter((a) => a.isPublic)
          : [];
    const meters = counted.reduce((acc, a) => acc + (a.distance || 0), 0);
    totalMeters += meters;
    const distanceKm = parseFloat((meters / 1000).toFixed(1));

    return {
      userId: m.user.id,
      name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || 'Runner',
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      stat: `${distanceKm} km`,
      distanceKm,
      durationSecs: counted.reduce((acc, a) => acc + (a.duration || 0), 0),
      workoutCount: counted.length,
    };
  });

  leaderboard.sort((a, b) => b.distanceKm - a.distanceKm);

  res.json({
    leaderboard: leaderboard.map((item, index) => ({ rank: index + 1, ...item })),
    totalDistanceKm: parseFloat((totalMeters / 1000).toFixed(1)),
    since: since || null,
  });
}

async function getTrybePosts(req, res) {
  const { trybeId } = req.params;
  const ctx = await loadTrybe(trybeId, req.userId);
  const isMember = !!ctx.role;

  const trybeMembers = await prisma.trybeMember.findMany({
    where: { trybeId },
    select: { userId: true },
  });

  const posts = await prisma.post.findMany({
    // Members share this Trybe with every author here, so Trybes-only posts
    // are visible to them; an onlooker browsing a public Trybe is not, and
    // the shared visibility filter keeps those posts out of their view.
    where: {
      AND: [
        { authorId: { in: trybeMembers.map((m) => m.userId) } },
        { hiddenBy: { none: { userId: req.userId } } },
        isMember ? {} : await postVisibilityFilter(req.userId),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      ...POST_INCLUDE,
      likes: { where: { userId: req.userId }, select: { userId: true } },
    },
  });

  res.json({ posts: posts.map((p) => serializePost(p, req.userId)) });
}

/**
 * Posts from everyone in every Trybe the caller belongs to, newest first. The
 * Trybes tab used to show only the first Trybe joined.
 *
 * No audience filter is needed: every author here shares a Trybe with the
 * caller, which is exactly who a Trybes-only post is for.
 */
async function listMyTrybesFeed(req, res) {
  const { cursor, limit } = req.validatedQuery;

  const memberships = await prisma.trybeMember.findMany({
    where: { userId: req.userId },
    select: { trybeId: true },
  });
  if (memberships.length === 0) {
    return res.json({ posts: [], nextCursor: null });
  }

  const authors = await prisma.trybeMember.findMany({
    where: { trybeId: { in: memberships.map((m) => m.trybeId) } },
    select: { userId: true },
    distinct: ['userId'],
  });

  const posts = await prisma.post.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: {
      authorId: { in: authors.map((a) => a.userId) },
      hiddenBy: { none: { userId: req.userId } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      ...POST_INCLUDE,
      likes: { where: { userId: req.userId }, select: { userId: true } },
    },
  });

  res.json({
    posts: posts.map((p) => serializePost(p, req.userId)),
    nextCursor: posts.length === limit ? posts[posts.length - 1].id : null,
  });
}

// ── Joining, leaving, inviting ──────────────────────────────────────────────

async function joinTrybe(req, res) {
  const trybe = await prisma.trybe.findUnique({ where: { id: req.params.trybeId } });
  if (!trybe) {
    throw new AppError(404, 'Trybe not found');
  }
  // Public Trybes are open to anyone. A private one admits its creator and the
  // people invited to it. The invite notification is the record of that
  // invitation: only a member can create one, so holding one is proof enough,
  // and ignoring the invite deletes it, which withdraws the right to join.
  if (!trybe.isPublic && trybe.creatorId !== req.userId) {
    const invite = await prisma.notification.findFirst({
      where: { recipientId: req.userId, type: 'TRYBE_INVITE', entityId: trybe.id },
      select: { id: true },
    });
    if (!invite) {
      throw new AppError(403, 'This Trybe is invite-only');
    }
  }

  await prisma.trybeMember.upsert({
    where: { trybeId_userId: { trybeId: trybe.id, userId: req.userId } },
    create: { trybeId: trybe.id, userId: req.userId, role: 'MEMBER' },
    update: {},
  });

  res.status(201).json({ joined: true });
}

async function leaveTrybe(req, res) {
  const membership = await membershipOf(req.params.trybeId, req.userId);
  if (membership && membership.role === 'CREATOR') {
    throw new AppError(400, 'The creator cannot leave their own Trybe. Delete it instead.');
  }
  await removeMembership(req.params.trybeId, req.userId);
  res.json({ joined: false });
}

/**
 * Invites someone to a Trybe. Any member can invite. Trybes are self-join, so
 * this creates a notification rather than a membership row, and a second
 * invite to someone already invited is not sent again.
 */
async function inviteToTrybe(req, res) {
  const { userId } = req.body;
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  if (userId === req.userId) {
    throw new AppError(400, 'You are already a member of this Trybe');
  }
  requireRole(ctx, EVERY_ROLE, 'Join this Trybe before inviting others');

  const invitee = await prisma.user.findUnique({ where: { id: userId } });
  if (!invitee) {
    throw new AppError(404, 'User not found');
  }

  if (await membershipOf(ctx.trybe.id, userId)) {
    return res.json({ invited: false, alreadyMember: true });
  }
  const pending = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'TRYBE_INVITE', entityId: ctx.trybe.id },
    select: { id: true },
  });
  if (pending) {
    return res.json({ invited: false, alreadyInvited: true });
  }

  await createNotification({
    recipientId: userId,
    actorId: req.userId,
    type: 'TRYBE_INVITE',
    title: ctx.trybe.name,
    body: `invited you to join "${ctx.trybe.name}".`,
    entityId: ctx.trybe.id,
  });

  res.status(201).json({ invited: true });
}

// ── Events ──────────────────────────────────────────────────────────────────

const EVENT_INCLUDE = {
  creator: USER_CARD,
  _count: { select: { rsvps: true } },
  // A handful of faces for the card; the full count comes from _count.
  rsvps: { orderBy: { createdAt: 'asc' }, take: 5, select: { user: USER_CARD } },
};

function eventEnd(event) {
  return event.endsAt || new Date(event.startsAt.getTime() + EVENT_GRACE_MS);
}

function serializeEvent(event, viewerId, role, goingIds) {
  const { rsvps, _count, ...rest } = event;
  return {
    ...rest,
    goingCount: _count ? _count.rsvps : 0,
    goingByMe: goingIds.has(event.id),
    attendees: (rsvps || []).map((r) => r.user),
    isPast: eventEnd(event) < new Date(),
    canManage: event.creatorId === viewerId || MANAGERS.includes(role),
  };
}

async function goingIdsFor(userId, eventIds) {
  if (eventIds.length === 0) return new Set();
  const rows = await prisma.trybeEventRsvp.findMany({
    where: { userId, eventId: { in: eventIds } },
    select: { eventId: true },
  });
  return new Set(rows.map((r) => r.eventId));
}

async function loadEvent(ctx, eventId) {
  const event = await prisma.trybeEvent.findUnique({ where: { id: eventId } });
  if (!event || event.trybeId !== ctx.trybe.id) {
    throw new AppError(404, 'Event not found');
  }
  return event;
}

/** Upcoming events soonest first, or past ones most recent first. */
async function listEvents(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  const { when } = req.validatedQuery;
  const now = new Date();
  const graceStart = new Date(now.getTime() - EVENT_GRACE_MS);

  const upcoming = {
    OR: [
      { endsAt: { gte: now } },
      { endsAt: null, startsAt: { gte: graceStart } },
    ],
  };
  const past = {
    OR: [
      { endsAt: { lt: now } },
      { endsAt: null, startsAt: { lt: graceStart } },
    ],
  };

  const events = await prisma.trybeEvent.findMany({
    where: { trybeId: ctx.trybe.id, ...(when === 'past' ? past : upcoming) },
    orderBy: { startsAt: when === 'past' ? 'desc' : 'asc' },
    take: when === 'past' ? 30 : 50,
    include: EVENT_INCLUDE,
  });

  const going = await goingIdsFor(req.userId, events.map((e) => e.id));
  res.json({ events: events.map((e) => serializeEvent(e, req.userId, ctx.role, going)) });
}

/**
 * Schedules an event and tells every member who has not muted the Trybe. The
 * organiser is marked as going, since someone who plans a run is on it.
 */
async function createEvent(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  requireRole(ctx, MANAGERS, 'Only the creator and captains can schedule events');

  const { title, description, location, activityType, startsAt, endsAt } = req.body;
  // A few minutes' slack, so an event created "now" is not refused for having
  // started a moment ago.
  if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new AppError(400, 'An event has to start in the future');
  }
  if (endsAt && endsAt <= startsAt) {
    throw new AppError(400, 'An event has to end after it starts');
  }

  const event = await prisma.trybeEvent.create({
    data: {
      trybeId: ctx.trybe.id,
      creatorId: req.userId,
      title,
      description,
      location,
      activityType,
      startsAt,
      endsAt: endsAt || null,
      rsvps: { create: { userId: req.userId } },
    },
    include: EVENT_INCLUDE,
  });

  await notifyTrybeMembers(ctx.trybe, req.userId, {
    type: 'TRYBE_EVENT',
    title: ctx.trybe.name,
    body: `scheduled "${title}".`,
  });

  res.status(201).json({
    event: serializeEvent(event, req.userId, ctx.role, new Set([event.id])),
  });
}

/** The organiser, the creator and captains can change or cancel an event. */
function requireEventManager(ctx, event, userId) {
  if (event.creatorId !== userId && !MANAGERS.includes(ctx.role)) {
    throw new AppError(403, 'Only the organiser, the creator or a captain can change this event');
  }
}

async function updateEvent(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  const event = await loadEvent(ctx, req.params.eventId);
  requireEventManager(ctx, event, req.userId);

  const data = {};
  for (const key of ['title', 'description', 'location', 'activityType', 'startsAt', 'endsAt']) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }
  const startsAt = data.startsAt || event.startsAt;
  const endsAt = data.endsAt !== undefined ? data.endsAt : event.endsAt;
  if (endsAt && endsAt <= startsAt) {
    throw new AppError(400, 'An event has to end after it starts');
  }

  const updated = await prisma.trybeEvent.update({
    where: { id: event.id },
    data,
    include: EVENT_INCLUDE,
  });
  const going = await goingIdsFor(req.userId, [updated.id]);
  res.json({ event: serializeEvent(updated, req.userId, ctx.role, going) });
}

async function deleteEvent(req, res) {
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  const event = await loadEvent(ctx, req.params.eventId);
  requireEventManager(ctx, event, req.userId);

  await prisma.trybeEvent.delete({ where: { id: event.id } });
  res.status(204).send();
}

/** POST marks the caller as going, DELETE takes that back. */
async function setRsvp(req, res) {
  const going = req.method === 'POST';
  const ctx = await loadTrybe(req.params.trybeId, req.userId);
  const event = await loadEvent(ctx, req.params.eventId);

  if (going) {
    requireRole(ctx, EVERY_ROLE, 'Join this Trybe to RSVP to its events');
    if (eventEnd(event) < new Date()) {
      throw new AppError(400, 'This event has already happened');
    }
    await prisma.trybeEventRsvp.upsert({
      where: { eventId_userId: { eventId: event.id, userId: req.userId } },
      create: { eventId: event.id, userId: req.userId },
      update: {},
    });
  } else {
    await prisma.trybeEventRsvp.deleteMany({
      where: { eventId: event.id, userId: req.userId },
    });
  }

  const goingCount = await prisma.trybeEventRsvp.count({ where: { eventId: event.id } });
  res.status(going ? 201 : 200).json({ going, goingCount });
}

module.exports = {
  listTrybes,
  createTrybe,
  getTrybe,
  updateTrybe,
  deleteTrybe,
  listMembers,
  setMemberRole,
  removeMember,
  setMuted,
  getLeaderboard,
  getTrybePosts,
  listMyTrybesFeed,
  joinTrybe,
  leaveTrybe,
  inviteToTrybe,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  setRsvp,
};
