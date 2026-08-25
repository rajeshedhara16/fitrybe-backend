const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const { updateGoalSchema } = require('../validators/goalValidators');
const { getGoal, updateGoal } = require('../controllers/goalController');

const router = express.Router();

router.use(requireAuth);

router.get('/', getGoal);
router.put('/', validate({ body: updateGoalSchema }), updateGoal);

module.exports = router;
