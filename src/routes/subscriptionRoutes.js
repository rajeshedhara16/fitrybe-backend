const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../utils/validate');
const { subscribeSchema } = require('../validators/subscriptionValidators');
const { getSubscriptionStatus, subscribe, cancelSubscription } = require('../controllers/subscriptionController');

const router = express.Router();

router.use(requireAuth);

router.get('/status', getSubscriptionStatus);
router.post('/subscribe', validate({ body: subscribeSchema }), subscribe);
router.post('/cancel', cancelSubscription);

module.exports = router;
