const { Router } = require('express');
const trybeController = require('../controllers/trybeController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');
const { z } = require('zod');
const { createTrybeSchema, listTrybesSchema } = require('../validators/trybeValidators');

const inviteSchema = z.object({ userId: z.string().uuid() });
const { makeUploader } = require('../middleware/upload');

const router = Router();
const uploadTrybeImage = makeUploader('trybes');

router.use(requireAuth);

router.get('/', validateQuery(listTrybesSchema), trybeController.listTrybes);
router.post(
  '/',
  uploadTrybeImage.single('image'),
  validateBody(createTrybeSchema),
  trybeController.createTrybe
);
router.get('/:trybeId', trybeController.getTrybe);
router.delete('/:trybeId', trybeController.deleteTrybe);

router.get('/:trybeId/members', trybeController.listMembers);
router.get('/:trybeId/leaderboard', trybeController.getLeaderboard);
router.get('/:trybeId/posts', trybeController.getTrybePosts);
router.post('/:trybeId/join', trybeController.joinTrybe);
router.delete('/:trybeId/join', trybeController.leaveTrybe);
router.post('/:trybeId/invite', validateBody(inviteSchema), trybeController.inviteToTrybe);

module.exports = router;
