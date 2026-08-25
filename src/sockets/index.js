const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const env = require('../config/env');

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins.length ? env.corsOrigins : '*',
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

    // --- Chat Events ---
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('chat:send', (data) => {
      // data: { conversationId, text, mediaUrl }
      io.to(`conversation:${data.conversationId}`).emit('chat:message', {
        ...data,
        senderId: socket.userId,
        createdAt: new Date(),
      });
    });

    socket.on('chat:typing', (data) => {
      // data: { conversationId, isTyping }
      socket.to(`conversation:${data.conversationId}`).emit('chat:user_typing', {
        userId: socket.userId,
        isTyping: data.isTyping,
      });
    });

    // --- Live Clique Telemetry Events ---
    socket.on('clique:join', (sessionId) => {
      socket.join(`clique:${sessionId}`);
    });

    socket.on('clique:leave', (sessionId) => {
      socket.leave(`clique:${sessionId}`);
    });

    socket.on('clique:telemetry', (data) => {
      // data: { sessionId, lat, lng, distance, pace, calories }
      socket.to(`clique:${data.sessionId}`).emit('clique:telemetry_update', {
        userId: socket.userId,
        lat: data.lat,
        lng: data.lng,
        distance: data.distance,
        pace: data.pace,
        calories: data.calories,
        timestamp: new Date(),
      });
    });

    socket.on('clique:status_change', (data) => {
      // data: { sessionId, status }
      io.to(`clique:${data.sessionId}`).emit('clique:status_updated', data);
    });

    socket.on('disconnect', () => {
      // Cleanup on disconnect
    });
  });

  return io;
}

module.exports = { initSocketServer };
