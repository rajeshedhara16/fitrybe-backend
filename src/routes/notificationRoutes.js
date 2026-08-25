const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const { listNotificationsQuerySchema } = require('../validators/notificationValidators');
const {
  listNotifications,
  markAsRead,
  deleteNotification,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listNotificationsQuerySchema }), listNotifications);
router.patch('/:notificationId/read', markAsRead);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
