const { Router } = require('express');
const trybeController = require('../controllers/trybeController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');
const { z } = require('zod');
const {
  createTrybeSchema,
  updateTrybeSchema,
  listTrybesSchema,
  leaderboardQuerySchema,
  feedQuerySchema,
  muteSchema,
  memberRoleSchema,
  createEventSchema,
  updateEventSchema,
  eventsQuerySchema,
  inviteCandidatesQuerySchema,
} = require('../validators/trybeValidators');
const { makeUploader } = require('../middleware/upload');

const inviteSchema = z.object({ userId: z.string().uuid() });

const router = Router();
const uploadTrybeImage = makeUploader('trybes');

router.use(requireAuth);

router.get('/', validateQuery(listTrybesSchema), trybeController.listTrybes);
router.post(
  '/',
  ...uploadTrybeImage.single('image'),
  validateBody(createTrybeSchema),
  trybeController.createTrybe
);

// Before '/:trybeId', or "feed" would be read as a Trybe id.
router.get('/feed', validateQuery(feedQuerySchema), trybeController.listMyTrybesFeed);

router.get('/:trybeId', trybeController.getTrybe);
router.patch(
  '/:trybeId',
  ...uploadTrybeImage.single('image'),
  validateBody(updateTrybeSchema),
  trybeController.updateTrybe
);
router.delete('/:trybeId', trybeController.deleteTrybe);

router.get('/:trybeId/members', trybeController.listMembers);
router.patch(
  '/:trybeId/members/:userId/role',
  validateBody(memberRoleSchema),
  trybeController.setMemberRole
);
router.delete('/:trybeId/members/:userId', trybeController.removeMember);

router.get(
  '/:trybeId/leaderboard',
  validateQuery(leaderboardQuerySchema),
  trybeController.getLeaderboard
);
router.get('/:trybeId/posts', trybeController.getTrybePosts);
router.post('/:trybeId/join', trybeController.joinTrybe);
router.delete('/:trybeId/join', trybeController.leaveTrybe);
router.post('/:trybeId/invite', validateBody(inviteSchema), trybeController.inviteToTrybe);
router.get(
  '/:trybeId/invite-candidates',
  validateQuery(inviteCandidatesQuerySchema),
  trybeController.listInviteCandidates
);
router.put('/:trybeId/mute', validateBody(muteSchema), trybeController.setMuted);

router.get('/:trybeId/events', validateQuery(eventsQuerySchema), trybeController.listEvents);
router.post('/:trybeId/events', validateBody(createEventSchema), trybeController.createEvent);
router.patch(
  '/:trybeId/events/:eventId',
  validateBody(updateEventSchema),
  trybeController.updateEvent
);
router.delete('/:trybeId/events/:eventId', trybeController.deleteEvent);
router.post('/:trybeId/events/:eventId/rsvp', trybeController.setRsvp);
router.delete('/:trybeId/events/:eventId/rsvp', trybeController.setRsvp);

module.exports = router;
