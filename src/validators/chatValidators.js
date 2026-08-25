const { z } = require('zod');

const createConversationSchema = z.object({
  recipientId: z.string().uuid().optional(), // For DIRECT chat
  trybeId: z.string().uuid().optional(),      // For TRYBE chat
  name: z.string().trim().max(100).optional(),  // For GROUP chat
  participantIds: z.array(z.string().uuid()).optional(),
});

// An image-only message carries no text, and `mediaUrl` is the server-relative
// path returned by POST /chat/upload rather than an absolute URL.
const sendMessageSchema = z
  .object({
    text: z.string().trim().max(2000).optional().default(''),
    mediaUrl: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.text.length > 0 || !!v.mediaUrl, {
    message: 'A message needs text or an attachment',
    path: ['text'],
  });

const listMessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

module.exports = {
  createConversationSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
};
