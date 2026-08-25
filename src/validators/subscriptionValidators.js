const { z } = require('zod');

const subscribeSchema = z.object({
  plan: z.enum(['MONTHLY', 'ANNUAL', 'TRIAL']).optional().default('MONTHLY'),
});

module.exports = { subscribeSchema };
