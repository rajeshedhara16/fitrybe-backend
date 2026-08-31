const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { emitToClique, emitToUser } = require('../sockets');

const CLIQUE_INCLUDE = {
  creator: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  participants: {
    orderBy: { joinedAt: 'asc' },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  },
};

/** Counts the lobby figures the clients display, derived in one place. */
function summarise(session) {
  const participants = session.participants || [];
  const joined = participants.filter((p) =>
    ['JOINED', 'ACTIVE', 'COMPLETED'].includes(p.status)
  );
  return {
    invitedCount: participants.filter((p) => p.status === 'INVITED').length,
    joinedCount: joined.length,
    readyCount: joined.filter((p) => p.isReady).length,
    participantCount: participants.length,
  };
}

function serialise(session) {
  return { ...session, counts: summarise(session) };
}

/**
 * Re-reads the session and pushes it to everyone in its socket room, so the
 * lobby roster and counts stay identical across devices.
 */
async function broadcastSession(sessionId) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: sessionId },
    include: CLIQUE_INCLUDE,
  });
  if (!session) return null;
  emitToClique(sessionId, 'clique:lobby_updated', { session: serialise(session) });
  return session;
}

async function createClique(req, res) {
  const {
    title,
    description,
    activityType = 'Run',
    scheduledAt,
    targetDistance,
    targetDuration,
    meetingLocation,
    routeData,
  } = req.body;

  const session = await prisma.cliqueSession.create({
    data: {
      title,
      description,
      activityType,
      creatorId: req.userId,
      scheduledAt: scheduledAt || new Date(),
      targetDistance,
      targetDuration,
      meetingLocation,
      routeData,
      participants: {
        create: {
          userId: req.userId,
          role: 'HOST',
          status: 'JOINED',
          // The host is implicitly ready — they are the one who starts it.
          isReady: true,
        },
      },
    },
    include: CLIQUE_INCLUDE,
  });

  res.status(201).json({ session: serialise(session) });
}

/**
 * Clique sessions are invite-only, so this lists only the sessions the caller
 * hosts or has been invited to.
 */
async function listCliques(req, res) {
  const { status, cursor, limit } = req.validatedQuery;

  const sessions = await prisma.cliqueSession.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: {
      ...(status ? { status } : {}),
      OR: [
        { creatorId: req.userId },
        { participants: { some: { userId: req.userId } } },
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    include: CLIQUE_INCLUDE,
  });

  const nextCursor = sessions.length === limit ? sessions[sessions.length - 1].id : null;

  res.json({ sessions: sessions.map(serialise), nextCursor });
}

/** Loads a session the caller is part of; outsiders get a 403. */
async function getClique(req, res) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
    include: CLIQUE_INCLUDE,
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  const isMember =
    session.creatorId === req.userId ||
    session.participants.some((p) => p.userId === req.userId);
  if (!isMember) {
    throw new AppError(403, 'This activity is invite-only');
  }

  res.json({ session: serialise(session) });
}

/**
 * Accepts an invite and enters the lobby. Sessions are invite-only, so a
 * participant row must already exist (created by the host's invite).
 * Joining a session that is already LIVE is allowed — late arrivals start
 * tracking from the moment they join.
 */
async function joinClique(req, res) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }
  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    throw new AppError(400, 'This activity has already finished');
  }

  const existing = await prisma.cliqueParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: req.userId } },
  });

  if (!existing && session.creatorId !== req.userId) {
    throw new AppError(403, 'You need an invite to join this activity');
  }

  // A late joiner goes straight to ACTIVE so they appear on the leaderboard.
  const nextStatus = session.status === 'LIVE' ? 'ACTIVE' : 'JOINED';

  await prisma.cliqueParticipant.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId: req.userId } },
    create: {
      sessionId: session.id,
      userId: req.userId,
      role: session.creatorId === req.userId ? 'HOST' : 'PARTICIPANT',
      status: nextStatus,
    },
    update: { status: nextStatus },
  });

  await broadcastSession(session.id);
  res.status(201).json({ joined: true });
}

/** Leaves the lobby, or declines an invite outright. */
async function leaveClique(req, res) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });
  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }
  if (session.creatorId === req.userId) {
    throw new AppError(400, 'The host cannot leave their own activity');
  }

  await prisma.cliqueParticipant.deleteMany({
    where: { sessionId: req.params.sessionId, userId: req.userId },
  });

  await broadcastSession(req.params.sessionId);
  res.json({ joined: false });
}

/**
 * Toggles the caller's lobby readiness. Only a joined participant can do this;
 * the host's readiness is implied by them pressing Start.
 */
async function setReady(req, res) {
  const { isReady } = req.body;
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });
  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  const participant = await prisma.cliqueParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: req.userId } },
  });
  if (!participant) {
    throw new AppError(403, 'Join the activity before setting your status');
  }
  if (participant.status === 'INVITED') {
    throw new AppError(400, 'Accept the invite before setting your status');
  }

  await prisma.cliqueParticipant.update({
    where: { id: participant.id },
    data: { isReady },
  });

  await broadcastSession(session.id);
  res.json({ isReady });
}

/**
 * Host-only lifecycle control. Starting the activity is deliberately not
 * blocked on everyone being ready — the client warns instead — so one idle
 * member cannot hold up the squad.
 */
async function updateStatus(req, res) {
  const { status } = req.body;
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
    include: { participants: true },
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  if (session.creatorId !== req.userId) {
    throw new AppError(403, 'Only the host can start or end this activity');
  }

  const updatedData = { status };
  if (status === 'LIVE' && !session.startedAt) {
    updatedData.startedAt = new Date();
  } else if (status === 'COMPLETED' && !session.endedAt) {
    updatedData.endedAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.cliqueSession.update({
      where: { id: session.id },
      data: updatedData,
      include: CLIQUE_INCLUDE,
    });

    if (status === 'LIVE') {
      // Everyone already in the lobby starts tracking together.
      await tx.cliqueParticipant.updateMany({
        where: { sessionId: session.id, status: 'JOINED' },
        data: { status: 'ACTIVE' },
      });
    } else if (status === 'COMPLETED') {
      await tx.cliqueParticipant.updateMany({
        where: { sessionId: session.id, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
    }

    return next;
  });

  // Tell the room, and ping each member's devices so a participant sitting on
  // another screen still learns the activity began.
  const fresh = await broadcastSession(session.id);
  emitToClique(session.id, 'clique:status_updated', {
    sessionId: session.id,
    status,
  });
  if (status === 'LIVE') {
    for (const p of session.participants) {
      if (p.userId === req.userId) continue;
      emitToUser(p.userId, 'clique:started', {
        sessionId: session.id,
        title: session.title,
      });
    }
  }

  res.json({ session: serialise(fresh || updated) });
}

/**
 * Invites another athlete to a session. They appear in the squad as INVITED
 * until they join, and get a notification linking back to the session.
 */
async function inviteToClique(req, res) {
  const { userId } = req.body;
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }
  if (session.creatorId !== req.userId) {
    throw new AppError(403, 'Only the host can invite people to this activity');
  }
  if (userId === req.userId) {
    throw new AppError(400, 'You are already part of this session');
  }

  const invitee = await prisma.user.findUnique({ where: { id: userId } });
  if (!invitee) {
    throw new AppError(404, 'User not found');
  }

  const existing = await prisma.cliqueParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId } },
  });
  // Never downgrade someone who already joined back to INVITED.
  if (existing && existing.status !== 'INVITED') {
    return res.json({ invited: false, alreadyJoined: true });
  }

  await prisma.cliqueParticipant.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    create: {
      sessionId: session.id,
      userId,
      role: 'PARTICIPANT',
      status: 'INVITED',
    },
    update: {},
  });

  const notification = await prisma.notification.create({
    data: {
      recipientId: userId,
      actorId: req.userId,
      type: 'CLIQUE_INVITE',
      title: session.title,
      body: `invited you to "${session.title}".`,
      entityId: session.id,
    },
    include: {
      actor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { recipientId: userId, isRead: false },
  });

  // Live badge update for the invitee, plus a roster refresh for the lobby.
  emitToUser(userId, 'notification:new', { notification, unreadCount });
  await broadcastSession(session.id);

  res.status(201).json({ invited: true });
}

module.exports = {
  createClique,
  listCliques,
  getClique,
  joinClique,
  leaveClique,
  setReady,
  updateStatus,
  inviteToClique,
};
