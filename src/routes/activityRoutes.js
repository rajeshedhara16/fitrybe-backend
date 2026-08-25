const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const {
  logActivitySchema,
  listActivitiesQuerySchema,
} = require('../validators/activityValidators');
const {
  logActivity,
  listActivities,
  getActivity,
  getAnalytics,
  deleteActivity,
} = require('../controllers/activityController');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate({ body: logActivitySchema }), logActivity);
router.get('/', validate({ query: listActivitiesQuerySchema }), listActivities);
router.get('/analytics', getAnalytics);
router.get('/:activityId', getActivity);
router.delete('/:activityId', deleteActivity);

module.exports = router;
