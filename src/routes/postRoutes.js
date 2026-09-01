const { Router } = require('express');
const postController = require('../controllers/postController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');
const {
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  paginationSchema,
} = require('../validators/postValidators');
const { makeUploader } = require('../middleware/upload');

const router = Router();
const uploadPostImages = makeUploader('posts');

router.use(requireAuth);

router.get('/', validateQuery(paginationSchema), postController.listFeed);
router.post(
  '/',
  uploadPostImages.array('images', 6),
  validateBody(createPostSchema),
  postController.createPost
);
router.get('/:postId', postController.getPost);
router.patch('/:postId', validateBody(updatePostSchema), postController.updatePost);
router.delete('/:postId', postController.deletePost);

router.post('/:postId/like', postController.likePost);
router.delete('/:postId/like', postController.unlikePost);

router.get('/:postId/comments', postController.listComments);
router.post('/:postId/comments', validateBody(createCommentSchema), postController.createComment);

module.exports = router;
