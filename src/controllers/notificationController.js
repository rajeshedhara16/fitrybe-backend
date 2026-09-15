const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { blockedUserIds } = require('../utils/blocks');

async function listNotifications(req, res) {
  const { unreadOnly, cursor, limit } = req.validatedQuery;

  const notifications = await prisma.notification.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: {
      recipientId: req.userId,
      // Anything from someone on the other side of a block stays out of sight.
      // A null actor has to be allowed explicitly, since NOT IN never matches null.
      OR: [{ actorId: null }, { actorId: { notIn: await blockedUserIds(req.userId) } }],
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const nextCursor =
    notifications.length === limit ? notifications[notifications.length - 1].id : null;

  const [unreadCount, states] = await Promise.all([
    prisma.notification.count({
      where: { recipientId: req.userId, isRead: false },
    }),
    inviteStates(req.userId, notifications),
  ]);

  res.json({
    notifications: notifications.map((n) =>
      states.has(n.id) ? { ...n, inviteState: states.get(n.id) } : n
    ),
    unreadCount,
    nextCursor,
  });
}

/**
 * Whether each invite on the page has already been answered: 'pending',
 * 'joined', 'declined' or 'expired'.
 *
 * Worked out from the memberships themselves rather than stored on the
 * notification, so an invite settles however the athlete joined — from the
 * notification, the Trybe page, or a lobby link. Without it every answered
 * invite showed its buttons again after a refresh.
 */
async function inviteStates(userId, notifications) {
  const ids = (type) =>
    notifications.filter((n) => n.type === type && n.entityId).map((n) => n.entityId);
  const trybeIds = ids('TRYBE_INVITE');
  const sessionIds = ids('CLIQUE_INVITE');

  const [trybes, memberships, sessions, participants] = await Promise.all([
    trybeIds.length
      ? prisma.trybe.findMany({ where: { id: { in: trybeIds } }, select: { id: true } })
      : [],
    trybeIds.length
      ? prisma.trybeMember.findMany({
          where: { userId, trybeId: { in: trybeIds } },
          select: { trybeId: true },
        })
      : [],
    sessionIds.length
      ? prisma.cliqueSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, status: true },
        })
      : [],
    sessionIds.length
      ? prisma.cliqueParticipant.findMany({
          where: { userId, sessionId: { in: sessionIds } },
          select: { sessionId: true, status: true },
        })
      : [],
  ]);

  const existingTrybes = new Set(trybes.map((t) => t.id));
  const joinedTrybes = new Set(memberships.map((m) => m.trybeId));
  const sessionStatus = new Map(sessions.map((x) => [x.id, x.status]));
  const participantStatus = new Map(participants.map((x) => [x.sessionId, x.status]));

  const states = new Map();
  for (const n of notifications) {
    if (n.type === 'TRYBE_INVITE') {
      if (joinedTrybes.has(n.entityId)) states.set(n.id, 'joined');
      else if (!existingTrybes.has(n.entityId)) states.set(n.id, 'expired');
      else states.set(n.id, 'pending');
    } else if (n.type === 'CLIQUE_INVITE') {
      const participant = participantStatus.get(n.entityId);
      const session = sessionStatus.get(n.entityId);
      if (participant && participant !== 'INVITED' && participant !== 'LEFT') {
        states.set(n.id, 'joined');
      } else if (!session || session === 'COMPLETED' || session === 'CANCELLED') {
        states.set(n.id, 'expired');
      } else if (participant === 'INVITED') {
        states.set(n.id, 'pending');
      } else {
        // Declining removes the pending participant row.
        states.set(n.id, 'declined');
      }
    }
  }
  return states;
}

async function markAsRead(req, res) {
  const { notificationId } = req.params;

  if (notificationId === 'all') {
    await prisma.notification.updateMany({
      where: { recipientId: req.userId, isRead: false },
      data: { isRead: true },
    });
    return res.json({ success: true });
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new AppError(404, 'Notification not found');
  }

  if (notification.recipientId !== req.userId) {
    throw new AppError(403, 'Unauthorized');
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  res.json({ success: true });
}

async function deleteNotification(req, res) {
  const notification = await prisma.notification.findUnique({
    where: { id: req.params.notificationId },
  });

  if (!notification) {
    throw new AppError(404, 'Notification not found');
  }

  if (notification.recipientId !== req.userId) {
    throw new AppError(403, 'Unauthorized');
  }

  await prisma.notification.delete({
    where: { id: req.params.notificationId },
  });

  res.status(204).send();
}

module.exports = {
  listNotifications,
  markAsRead,
  deleteNotification,
};
