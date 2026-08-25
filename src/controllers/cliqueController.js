const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const CLIQUE_INCLUDE = {
  creator: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  participants: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  },
};

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
        },
      },
    },
    include: CLIQUE_INCLUDE,
  });

  res.status(201).json({ session });
}

async function listCliques(req, res) {
  const { status, cursor, limit } = req.validatedQuery;

  const sessions = await prisma.cliqueSession.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: status ? { status } : undefined,
    orderBy: { scheduledAt: 'desc' },
    include: CLIQUE_INCLUDE,
  });

  const nextCursor = sessions.length === limit ? sessions[sessions.length - 1].id : null;

  res.json({ sessions, nextCursor });
}

async function getClique(req, res) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
    include: CLIQUE_INCLUDE,
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  res.json({ session });
}

async function joinClique(req, res) {
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  await prisma.cliqueParticipant.upsert({
    where: {
      sessionId_userId: { sessionId: session.id, userId: req.userId },
    },
    create: {
      sessionId: session.id,
      userId: req.userId,
      role: 'PARTICIPANT',
      status: 'JOINED',
    },
    update: {
      status: 'JOINED',
    },
  });

  res.status(201).json({ joined: true });
}

async function leaveClique(req, res) {
  await prisma.cliqueParticipant.deleteMany({
    where: { sessionId: req.params.sessionId, userId: req.userId },
  });

  res.json({ joined: false });
}

async function updateStatus(req, res) {
  const { status } = req.body;
  const session = await prisma.cliqueSession.findUnique({
    where: { id: req.params.sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Clique session not found');
  }

  if (session.creatorId !== req.userId) {
    throw new AppError(403, 'Only the host can update clique status');
  }

  const updatedData = { status };
  if (status === 'LIVE' && !session.startedAt) {
    updatedData.startedAt = new Date();
  } else if (status === 'COMPLETED' && !session.endedAt) {
    updatedData.endedAt = new Date();
  }

  const updated = await prisma.cliqueSession.update({
    where: { id: session.id },
    data: updatedData,
    include: CLIQUE_INCLUDE,
  });

  res.json({ session: updated });
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

  await prisma.notification.create({
    data: {
      recipientId: userId,
      actorId: req.userId,
      type: 'CLIQUE_INVITE',
      title: session.title,
      body: `invited you to "${session.title}".`,
      entityId: session.id,
    },
  });

  res.status(201).json({ invited: true });
}

module.exports = {
  createClique,
  listCliques,
  getClique,
  joinClique,
  leaveClique,
  updateStatus,
  inviteToClique,
};
