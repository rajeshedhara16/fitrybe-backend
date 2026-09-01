const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/prisma');
const env = require('../config/env');

/// Holds the running Socket.IO server so controllers can push authoritative
/// updates after a REST mutation (see `emitToClique` / `emitToUser`).
let io = null;

/**
 * Rooms are private, so a socket may only enter one it has been proven to
 * belong to. The ids it clears are remembered on the socket, which keeps the
 * per-event checks free of database round trips.
 */
async function canJoinConversation(userId, conversationId) {
  if (typeof conversationId !== 'string' || !conversationId) return false;
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!membership;
}

async function canJoinClique(userId, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  const session = await prisma.cliqueSession.findUnique({
    where: { id: sessionId },
    select: { creatorId: true, participants: { where: { userId }, select: { id: true } } },
  });
  if (!session) return false;
  return session.creatorId === userId || session.participants.length > 0;
}

function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      // Mirrors the REST policy: an unset allow-list is only permissive
      // outside production, so a deployed server never accepts sockets from
      // an arbitrary browser origin.
      origin: env.corsOrigins.length
        ? env.corsOrigins
        : env.nodeEnv === 'production'
          ? false
          : '*',
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Missing auth token'));
    }
    try {
      const payload = verifyAccessToken(token);
      if (payload.type !== 'access') throw new Error('Wrong token type');
      socket.userId = payload.sub;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Join personal user room for direct push notifications
    socket.join(`user:${socket.userId}`);

    // Rooms this socket has proven membership of.
    socket.data.conversations = new Set();
    socket.data.cliques = new Set();

    // --- Chat Events ---
    socket.on('join_conversation', async (conversationId) => {
      if (!(await canJoinConversation(socket.userId, conversationId))) {
        socket.emit('chat:error', {
          conversationId,
          error: 'You are not a member of this conversation',
        });
        return;
      }
      socket.data.conversations.add(conversationId);
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.data.conversations.delete(conversationId);
      socket.leave(`conversation:${conversationId}`);
    });

    // Message fan-out is driven by the REST handler once the message is
    // persisted (see chatController.sendMessage), so clients cannot inject
    // unsaved text into a room and no listener has to trust the sender.

    socket.on('chat:typing', (data) => {
      const conversationId = data && data.conversationId;
      if (!socket.data.conversations.has(conversationId)) return;
      socket.to(`conversation:${conversationId}`).emit('chat:user_typing', {
        userId: socket.userId,
        isTyping: !!data.isTyping,
      });
    });

    // --- Live Clique Telemetry Events ---
    socket.on('clique:join', async (sessionId) => {
      if (!(await canJoinClique(socket.userId, sessionId))) {
        socket.emit('clique:error', {
          sessionId,
          error: 'This activity is invite-only',
        });
        return;
      }
      socket.data.cliques.add(sessionId);
      socket.join(`clique:${sessionId}`);
    });

    socket.on('clique:leave', (sessionId) => {
      socket.data.cliques.delete(sessionId);
      socket.leave(`clique:${sessionId}`);
    });

    socket.on('clique:telemetry', (data) => {
      // data: { sessionId, lat, lng, distance, pace, calories }
      const sessionId = data && data.sessionId;
      if (!socket.data.cliques.has(sessionId)) return;
      socket.to(`clique:${sessionId}`).emit('clique:telemetry_update', {
        userId: socket.userId,
        lat: data.lat,
        lng: data.lng,
        distance: data.distance,
        pace: data.pace,
        calories: data.calories,
        timestamp: new Date(),
      });

      persistTelemetry(socket, sessionId, data);
    });

    socket.on('disconnect', () => {
      // Cleanup on disconnect
    });
  });

  return io;
}

/**
 * Telemetry arrives about once a second per athlete, which is far more often
 * than the database needs it. Writing on this interval is enough for someone
 * who reconnects — or opens a session already in progress — to see the squad's
 * real positions instead of a leaderboard reset to zero.
 */
const TELEMETRY_PERSIST_INTERVAL_MS = 10000;

function persistTelemetry(socket, sessionId, data) {
  const now = Date.now();
  const key = `${sessionId}:${socket.userId}`;
  socket.data.lastPersist = socket.data.lastPersist || new Map();
  const last = socket.data.lastPersist.get(key) || 0;
  if (now - last < TELEMETRY_PERSIST_INTERVAL_MS) return;
  socket.data.lastPersist.set(key, now);

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

  prisma.cliqueParticipant
    .updateMany({
      where: { sessionId, userId: socket.userId },
      data: {
        currentLat: num(data.lat),
        currentLng: num(data.lng),
        currentDistance: num(data.distance),
        currentPace: num(data.pace),
      },
    })
    // A dropped telemetry write must never take the socket down; the next
    // tick carries fresher numbers anyway.
    .catch((err) => console.error('telemetry persist failed', err));
}

/**
 * Broadcasts the authoritative lobby/session state to everyone watching a
 * clique session. Emitted from the controllers after a join, invite, ready
 * toggle, leave, or status change so no client has to guess.
 */
function emitToClique(sessionId, event, payload) {
  if (!io) return;
  io.to(`clique:${sessionId}`).emit(event, payload);
}

/** Pushes an event to every device a given user has connected. */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** Pushes an event to everyone currently in a conversation's room. */
function emitToConversation(conversationId, event, payload) {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event, payload);
}

module.exports = { initSocketServer, emitToClique, emitToUser, emitToConversation };
