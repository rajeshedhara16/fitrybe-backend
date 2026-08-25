const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

async function listNotifications(req, res) {
  const { unreadOnly, cursor, limit } = req.validatedQuery;

  const notifications = await prisma.notification.findMany({
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    where: {
      recipientId: req.userId,
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

  const unreadCount = await prisma.notification.count({
    where: { recipientId: req.userId, isRead: false },
  });

  res.json({ notifications, unreadCount, nextCursor });
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
