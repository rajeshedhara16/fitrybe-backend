const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Sends transactional email over SMTP.
 *
 * SMTP rather than a particular vendor's API on purpose: Resend, SendGrid, SES,
 * Postmark and an ordinary mailbox all speak it, so switching provider is four
 * environment variables and no code.
 */

// Built once. A transport per message would open a new TLS connection for every
// send, which is both slow and a good way to get rate-limited by the provider.
let transport = null;

function getTransport() {
  if (!env.mail.enabled) return null;
  transport ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    // 465 is implicit TLS; everything else starts plaintext and upgrades.
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
  });
  return transport;
}

/** Whether email can actually be delivered right now. */
function canSend() {
  return env.mail.enabled;
}

async function send({ to, subject, text, html }) {
  const mailer = getTransport();
  if (!mailer) {
    throw new Error('Email is not configured');
  }
  await mailer.sendMail({ from: env.mail.from, to, subject, text, html });
}

/**
 * The password reset code.
 *
 * Plain text carries the code as well as the HTML, because a mail client set to
 * plain text would otherwise show an empty message. The wording deliberately
 * avoids saying whether an account exists beyond what the recipient can already
 * see, and tells someone who did not ask that ignoring it is enough.
 */
async function sendPasswordResetCode({ to, code, minutes }) {
  const subject = 'Your Fitrybe password reset code';
  const text = [
    `Your Fitrybe password reset code is ${code}.`,
    '',
    `It expires in ${minutes} minutes and can be used once.`,
    '',
    'If you did not ask to reset your password, you can ignore this email.',
    'Nothing has changed on your account.',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1c1e">
      <p style="font-size:15px;margin:0 0 20px">Your Fitrybe password reset code is</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#ff5722">${code}</p>
      <p style="font-size:14px;color:#5c5c62;margin:0 0 20px">
        It expires in ${minutes} minutes and can be used once.
      </p>
      <p style="font-size:13px;color:#8a8a90;margin:0">
        If you did not ask to reset your password you can ignore this email.
        Nothing has changed on your account.
      </p>
    </div>
  `;

  await send({ to, subject, text, html });
}

module.exports = { canSend, send, sendPasswordResetCode };
