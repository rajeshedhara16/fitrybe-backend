const prisma = require('../config/prisma');

async function getSubscriptionStatus(req, res) {
  const userId = req.userId;

  let subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return res.json({
      isPro: false,
      subscription: null,
      status: 'FREE_TIER',
    });
  }

  const now = new Date();
  const isExpired = subscription.expiresAt && subscription.expiresAt < now;
  const isPro = subscription.status === 'ACTIVE' && !isExpired;

  res.json({
    isPro,
    subscription,
    status: isPro ? 'PRO_ACTIVE' : (isExpired ? 'EXPIRED' : subscription.status),
  });
}

async function subscribe(req, res) {
  const userId = req.userId;
  const { plan = 'MONTHLY' } = req.body;

  const now = new Date();
  const expiresAt = new Date(now);

  if (plan === 'ANNUAL') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else if (plan === 'TRIAL') {
    expiresAt.setDate(expiresAt.getDate() + 14);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  const subscription = await prisma.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: 'ACTIVE',
      startDate: now,
      expiresAt,
    },
    create: {
      userId,
      plan,
      status: 'ACTIVE',
      startDate: now,
      expiresAt,
    },
  });

  res.status(201).json({
    message: 'Subscription updated successfully',
    isPro: true,
    subscription,
  });
}

async function cancelSubscription(req, res) {
  const userId = req.userId;

  const subscription = await prisma.subscription.update({
    where: { userId },
    data: {
      status: 'CANCELLED',
    },
  });

  res.json({
    message: 'Subscription cancelled',
    isPro: false,
    subscription,
  });
}

module.exports = {
  getSubscriptionStatus,
  subscribe,
  cancelSubscription,
};
