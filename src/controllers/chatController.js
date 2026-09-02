const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { emitToConversation } = require('../sockets');
const { deleteByUrls } = require('../services/storage');

const SENDER_SELECT = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true },
};

// A quoted message is rendered inline, so it only needs enough to show a
// one-line preview — not the full record.
const REPLY_INCLUDE = {
  select: {
    id: true,
    text: true,
    mediaUrl: true,
    senderId: true,
    sender: SENDER_SELECT,
  },
};

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
      sender: SENDER_SELECT,
      replyTo: REPLY_INCLUDE,
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

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new AppError(404, 'User not found');
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
    // Opening a Trybe's chat is a member-only action; without this check a
    // stranger could create the conversation and read everything posted in it.
    const membership = await prisma.trybeMember.findUnique({
      where: { trybeId_userId: { trybeId, userId: req.userId } },
      select: { id: true },
    });
    if (!membership) {
      throw new AppError(403, 'Join this Trybe to open its chat');
    }

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
  const requested = Array.from(new Set(participantIds || [])).filter(
    (id) => id !== req.userId
  );

  // Drop ids that are not real accounts, so a typo or a probe cannot seed a
  // conversation with rows pointing at nothing.
  const known = await prisma.user.findMany({
    where: { id: { in: requested } },
    select: { id: true },
  });
  if (known.length !== requested.length) {
    throw new AppError(400, 'One or more participants could not be found');
  }

  const uniqueParticipants = [req.userId, ...known.map((u) => u.id)];

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
  const { text, mediaUrl, replyToId } = req.body;

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.userId } },
  });

  if (!membership) {
    throw new AppError(403, 'You are not a member of this conversation');
  }

  // A reply may only quote a message from this same conversation, or it would
  // leak text out of a thread the sender might not even belong to.
  if (replyToId) {
    const quoted = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { conversationId: true },
    });
    if (!quoted || quoted.conversationId !== conversationId) {
      throw new AppError(400, 'You can only reply to a message in this chat');
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.userId,
      text,
      mediaUrl,
      replyToId,
    },
    include: {
      sender: SENDER_SELECT,
      replyTo: REPLY_INCLUDE,
    },
  });

  // Touch conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Fan the stored message out to everyone in the room. Broadcasting from
  // here — rather than letting the sender emit its own copy — means listeners
  // receive the persisted record, attachments included, and nothing reaches a
  // room that was not written to the database first.
  emitToConversation(conversationId, 'chat:message', { message });

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

/**
 * Removes one of the caller's own messages for everyone in the thread. Replies
 * that quoted it survive — the schema nulls the link rather than cascading.
 */
async function deleteMessage(req, res) {
  const { conversationId, messageId } = req.params;

  // Membership first. Someone outside the thread must not be able to tell a
  // message apart from one that never existed, so they get 404 either way.
  // A member who simply is not the sender gets 403, which tells them nothing
  // they cannot already see.
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(404, 'Message not found');
  }

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId) {
    throw new AppError(404, 'Message not found');
  }
  if (message.senderId !== req.userId) {
    throw new AppError(403, 'You can only delete your own messages');
  }

  await prisma.message.delete({ where: { id: messageId } });

  // Nothing points at the attachment any more.
  await deleteByUrls(message.mediaUrl);

  emitToConversation(conversationId, 'chat:message_deleted', {
    conversationId,
    messageId,
  });

  res.status(204).send();
}

module.exports = {
  listConversations,
  getMessages,
  createConversation,
  sendMessage,
  deleteMessage,
  markRead,
};
