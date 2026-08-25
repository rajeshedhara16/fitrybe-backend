const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

async function listConversations(req, res) {
  const conversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: { userId: req.userId },
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
      },
      trybe: {
        select: { id: true, name: true, imageUrl: true },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const formatted = conversations.map((c) => {
    const lastMessage = c.messages[0] || null;
    const otherMembers = c.members.filter((m) => m.userId !== req.userId);

    // Calculate display name & avatar based on type
    let title = c.name;
    let avatarUrl = null;

    if (c.type === 'TRYBE' && c.trybe) {
      title = c.trybe.name;
      avatarUrl = c.trybe.imageUrl;
    } else if (c.type === 'DIRECT' && otherMembers.length > 0) {
      const otherUser = otherMembers[0].user;
      title = `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'User';
      avatarUrl = otherUser.avatarUrl;
    }

    return {
      id: c.id,
      type: c.type,
      title,
      avatarUrl,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            text: lastMessage.text,
            senderId: lastMessage.senderId,
            senderName: `${lastMessage.sender.firstName || ''} ${lastMessage.sender.lastName || ''}`.trim(),
            createdAt: lastMessage.createdAt,
          }
        : null,
      updatedAt: c.updatedAt,
      membersCount: c.members.length,
    };
  });

  res.json({ conversations: formatted });
}

async function getMessages(req, res) {
  const { conversationId } = req.params;
  const { cursor, limit } = req.validatedQuery;

  // Ensure user is member of conversation
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.userId } },
  });

  if (!membership) {
    throw new AppError(403, 'You are not a member of this conversation');
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;

  res.json({ messages: messages.reverse(), nextCursor });
}

async function createConversation(req, res) {
  const { recipientId, trybeId, name, participantIds } = req.body;

  // Direct DM handling
  if (recipientId) {
    if (recipientId === req.userId) {
      throw new AppError(400, 'Cannot start a conversation with yourself');
    }

    // Check if direct conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: req.userId } } },
          { members: { some: { userId: recipientId } } },
        ],
      },
    });

    if (existing) {
      return res.json({ conversationId: existing.id });
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        members: {
          create: [
            { userId: req.userId },
            { userId: recipientId },
          ],
        },
      },
    });

    return res.status(201).json({ conversationId: conversation.id });
  }

  // Trybe chat handling
  if (trybeId) {
    const existing = await prisma.conversation.findFirst({
      where: { trybeId },
    });

    if (existing) {
      return res.json({ conversationId: existing.id });
    }

    const trybeMembers = await prisma.trybeMember.findMany({ where: { trybeId } });

    const conversation = await prisma.conversation.create({
      data: {
        type: 'TRYBE',
        trybeId,
        members: {
          create: trybeMembers.map((m) => ({ userId: m.userId })),
        },
      },
    });

    return res.status(201).json({ conversationId: conversation.id });
  }

  // Group chat handling
  const uniqueParticipants = Array.from(new Set([req.userId, ...(participantIds || [])]));

  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: name || 'Group Chat',
      members: {
        create: uniqueParticipants.map((id) => ({ userId: id })),
      },
    },
  });

  res.status(201).json({ conversationId: conversation.id });
}

async function sendMessage(req, res) {
  const { conversationId } = req.params;
  const { text, mediaUrl } = req.body;

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.userId } },
  });

  if (!membership) {
    throw new AppError(403, 'You are not a member of this conversation');
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.userId,
      text,
      mediaUrl,
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  // Touch conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  res.status(201).json({ message });
}

async function markRead(req, res) {
  const { conversationId } = req.params;

  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: req.userId },
    data: { lastReadAt: new Date() },
  });

  res.json({ read: true });
}

module.exports = {
  listConversations,
  getMessages,
  createConversation,
  sendMessage,
  markRead,
};
