const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const { z } = require('zod');
const {
  createCliqueSchema,
  updateCliqueStatusSchema,
  listCliquesQuerySchema,
} = require('../validators/cliqueValidators');
const {
  createClique,
  listCliques,
  getClique,
  joinClique,
  leaveClique,
  updateStatus,
  inviteToClique,
} = require('../controllers/cliqueController');

const inviteSchema = z.object({ userId: z.string().uuid() });

const router = express.Router();

router.use(requireAuth);

router.post('/', validate({ body: createCliqueSchema }), createClique);
router.get('/', validate({ query: listCliquesQuerySchema }), listCliques);
router.get('/:sessionId', getClique);
router.post('/:sessionId/join', joinClique);
router.post('/:sessionId/leave', leaveClique);
router.post('/:sessionId/invite', validate({ body: inviteSchema }), inviteToClique);
router.patch('/:sessionId/status', validate({ body: updateCliqueStatusSchema }), updateStatus);

module.exports = router;
