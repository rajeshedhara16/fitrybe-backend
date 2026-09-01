const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const {
  logActivitySchema,
  listActivitiesQuerySchema,
  analyticsQuerySchema,
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
router.get('/analytics', validate({ query: analyticsQuerySchema }), getAnalytics);
router.get('/:activityId', getActivity);
router.delete('/:activityId', deleteActivity);

module.exports = router;
