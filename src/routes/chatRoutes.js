const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { makeUploader } = require('../middleware/upload');
const AppError = require('../utils/AppError');
const validate = require('../utils/validate');
const {
  createConversationSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
} = require('../validators/chatValidators');
const {
  listConversations,
  getMessages,
  createConversation,
  sendMessage,
  markRead,
} = require('../controllers/chatController');

const router = express.Router();
const uploadChatImage = makeUploader('chat');

router.use(requireAuth);

// Attachments are uploaded first, then referenced by URL on the message.
router.post('/upload', ...uploadChatImage.single('image'), (req, res) => {
  const uploaded = req.uploads?.[0];
  if (!uploaded) {
    throw new AppError(400, 'No file uploaded');
  }
  res.status(201).json({ url: uploaded.url });
});

router.get('/conversations', listConversations);
router.post('/conversations', validate({ body: createConversationSchema }), createConversation);
router.get(
  '/conversations/:conversationId/messages',
  validate({ query: listMessagesQuerySchema }),
  getMessages
);
router.post(
  '/conversations/:conversationId/messages',
  validate({ body: sendMessageSchema }),
  sendMessage
);
router.post('/conversations/:conversationId/read', markRead);

module.exports = router;
