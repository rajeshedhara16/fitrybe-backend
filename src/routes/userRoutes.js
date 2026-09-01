const { Router } = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');
const {
  updateProfileSchema,
  userSearchSchema,
} = require('../validators/userValidators');
const { makeUploader } = require('../middleware/upload');

const router = Router();
const uploadAvatar = makeUploader('avatars');
const uploadBanner = makeUploader('banners');

router.use(requireAuth);

router.get('/search', validateQuery(userSearchSchema), userController.searchUsers);
router.patch('/me', validateBody(updateProfileSchema), userController.updateMe);
router.post('/me/avatar', uploadAvatar.single('avatar'), userController.uploadAvatar);
router.post('/me/banner', uploadBanner.single('banner'), userController.uploadBanner);

router.get('/:userId', userController.getUserById);
router.get('/:userId/followers', userController.getFollowers);
router.get('/:userId/following', userController.getFollowing);
router.post('/:userId/follow', userController.followUser);
router.delete('/:userId/follow', userController.unfollowUser);

module.exports = router;
