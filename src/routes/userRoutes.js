const { Router } = require('express');
const userController = require('../controllers/userController');
const blockController = require('../controllers/blockController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');
const {
  updateProfileSchema,
  userSearchSchema,
  deleteAccountSchema,
  linkIdentitySchema,
} = require('../validators/userValidators');
const { makeUploader } = require('../middleware/upload');

const router = Router();
const uploadAvatar = makeUploader('avatars');
const uploadBanner = makeUploader('banners');

router.use(requireAuth);

router.get('/search', validateQuery(userSearchSchema), userController.searchUsers);
router.patch('/me', validateBody(updateProfileSchema), userController.updateMe);
router.delete('/me', validateBody(deleteAccountSchema), userController.deleteMe);
// Connected sign-in methods. Above the '/:userId' routes below, or 'me' would
// be read as somebody's id.
router.get('/me/identities', userController.listIdentities);
router.post('/me/identities', validateBody(linkIdentitySchema), userController.linkIdentity);
router.delete('/me/identities/:provider', userController.unlinkIdentity);
router.get('/me/blocks', blockController.listBlockedUsers);

router.post('/me/avatar', ...uploadAvatar.single('avatar'), userController.uploadAvatar);
router.post('/me/banner', ...uploadBanner.single('banner'), userController.uploadBanner);

router.get('/:userId', userController.getUserById);
router.get('/:userId/followers', userController.getFollowers);
router.get('/:userId/following', userController.getFollowing);
router.post('/:userId/follow', userController.followUser);
router.delete('/:userId/follow', userController.unfollowUser);
router.post('/:userId/block', blockController.blockUser);
router.delete('/:userId/block', blockController.unblockUser);

module.exports = router;
