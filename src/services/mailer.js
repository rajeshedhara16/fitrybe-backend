const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Sends transactional email, over HTTPS where possible and SMTP where not.
 *
 * HTTPS is the default for a reason learned the hard way: hosting platforms
 * routinely block outbound SMTP so their address space cannot be used to send
 * spam. The failure is a bare TCP connect timeout, which reads like broken
 * credentials but is the port never opening. A provider's HTTP API goes out on
 * 443 alongside every other request the server makes, so there is no port to
 * be blocked.
 *
 * SMTP is kept for anywhere it does work, and for pointing at a local catcher
 * in development.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Built once. A transport per message opens a new TLS connection every time.
let transport = null;

function smtpTransport() {
  transport ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    // 465 is implicit TLS; everything else starts plaintext and upgrades.
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
    // Fail fast. The default lets a blocked port hang for minutes, which turns
    // one unreachable host into a pile of stuck requests.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transport;
}

/** Whether email can actually be delivered right now. */
function canSend() {
  return env.mail.enabled;
}

/** Which way mail is going out: 'resend', 'smtp', or 'none'. */
function provider() {
  return env.mail.provider;
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.mail.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.mail.from, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    // The body names the actual problem — an unverified sending domain, most
    // often — and saying so beats a bare status code.
    const detail = await res.text();
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp({ to, subject, text, html }) {
  try {
    await smtpTransport().sendMail({
      from: env.mail.from,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      throw new Error(
        `Could not reach ${env.mail.host}:${env.mail.port} (${err.code}). ` +
          'Hosting platforms commonly block outbound SMTP; set RESEND_API_KEY ' +
          'to send over HTTPS instead.'
      );
    }
    throw err;
  }
}

async function send(message) {
  switch (env.mail.provider) {
    case 'resend':
      return sendViaResend(message);
    case 'smtp':
      return sendViaSmtp(message);
    default:
      throw new Error('Email is not configured');
  }
}

/**
 * The password reset code.
 *
 * Plain text carries the code as well as the HTML, because a mail client set to
 * plain text would otherwise show an empty message. The wording tells someone
 * who did not ask for this that ignoring it is enough.
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

module.exports = { canSend, provider, send, sendPasswordResetCode };
