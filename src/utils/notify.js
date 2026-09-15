const prisma = require('../config/prisma');
const { emitToUser } = require('../sockets');
const { isBlockedBetween } = require('./blocks');

/**
 * Creates a notification and pushes it to the recipient's devices along with
 * their new unread total, so the notifications tab badge updates without the
 * app having to poll.
 */
async function createNotification(data) {
  // Nobody hears from someone they blocked, or who blocked them. Checked here
  // so every kind of notification obeys it without each caller remembering.
  if (data.actorId && (await isBlockedBetween(data.actorId, data.recipientId))) {
    return null;
  }

  const notification = await prisma.notification.create({
    data,
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { recipientId: data.recipientId, isRead: false },
  });

  emitToUser(data.recipientId, 'notification:new', { notification, unreadCount });

  return notification;
}

module.exports = { createNotification };
