require('express-async-errors');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const trybeRoutes = require('./routes/trybeRoutes');
const activityRoutes = require('./routes/activityRoutes');
const chatRoutes = require('./routes/chatRoutes');
const cliqueRoutes = require('./routes/cliqueRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const goalRoutes = require('./routes/goalRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow all localhost and 127.0.0.1 origins for local Flutter Web development
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Check explicitly configured CORS origins
      if (env.corsOrigins.length) {
        if (env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      }

      // Default fallback: allow
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Baseline limiter across the whole API; auth routes layer a stricter one on top.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/trybes', trybeRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/cliques', cliqueRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
