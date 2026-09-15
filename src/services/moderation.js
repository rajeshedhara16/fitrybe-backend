const prisma = require('../config/prisma');
const env = require('../config/env');
const mailer = require('./mailer');

function nameOf(user) {
  if (!user) return 'a deleted account';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
}

/**
 * Emails the moderation inbox about a reported post.
 *
 * App Review expects reported content to be looked at, and a report nobody
 * hears about is not that. Sent after the report is stored and never allowed
 * to fail the request: the athlete's report is recorded either way, and the
 * reason it could not be emailed goes to the logs.
 */
async function alertPostReported({ post, reporterId, reason, details }) {
  if (!env.mail.reportsTo) {
    console.warn(`[fitrybe] Post ${post.id} was reported (${reason}) but REPORTS_EMAIL is not set, so nobody was told.`);
    return;
  }
  if (!mailer.canSend()) {
    console.warn(`[fitrybe] Post ${post.id} was reported (${reason}) but email is not configured.`);
    return;
  }

  const userSelect = { select: { id: true, email: true, firstName: true, lastName: true } };
  const [author, reporter, reportCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: post.authorId }, ...userSelect }),
    prisma.user.findUnique({ where: { id: reporterId }, ...userSelect }),
    prisma.postReport.count({ where: { postId: post.id } }),
  ]);

  const text = [
    `A post on Fitrybe was reported for ${reason}.`,
    '',
    `Reports on this post so far: ${reportCount}`,
    `Post: ${post.id}`,
    `Author: ${nameOf(author)} <${author?.email || 'unknown'}> (${post.authorId})`,
    `Reported by: ${nameOf(reporter)} <${reporter?.email || 'unknown'}> (${reporterId})`,
    ...(details ? [`Details: ${details}`] : []),
    '',
    `Caption: ${post.caption || '(none)'}`,
    ...(post.imageUrls || []).map((url) => `Image: ${url}`),
    '',
    'Apple expects reported content to be reviewed within 24 hours.',
  ].join('\n');

  await mailer.send({
    to: env.mail.reportsTo,
    subject: `[Fitrybe report] ${reason} on a post by ${nameOf(author)}`,
    text,
  });
}

module.exports = { alertPostReported };
