const prisma = require('../config/prisma');
const { emitToUser } = require('../sockets');

/**
 * Creates a notification and pushes it to the recipient's devices along with
 * their new unread total, so the notifications tab badge updates without the
 * app having to poll.
 */
async function createNotification(data) {
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
