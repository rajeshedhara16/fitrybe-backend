/**
 * Checks that outgoing email actually works with the current environment.
 *
 * Run locally after filling in .env:
 *     node scripts/verify_mail.js you@example.com
 *
 * Or against the deployed environment, without copying secrets anywhere:
 *     railway run node scripts/verify_mail.js you@example.com
 *
 * The second form is the one that matters. Email failing in production while
 * working locally is almost always the platform blocking outbound SMTP, and
 * that only shows up when the check runs where the server runs.
 *
 * Nothing is printed that would expose a credential — only lengths and shapes.
 */
require('dotenv').config();

const env = require('../src/config/env');
const mailer = require('../src/services/mailer');

const ok = (m) => console.log(`  [PASS] ${m}`);
const bad = (m, hint) => {
  console.log(`  [FAIL] ${m}`);
  if (hint) console.log(`         -> ${hint}`);
};

async function main() {
  const to = process.argv[2];

  console.log('\nFitrybe email check\n');

  console.log('Configuration');
  if (!env.mail.enabled) {
    bad(
      'No email provider configured',
      'Set RESEND_API_KEY to send over HTTPS, or SMTP_HOST, SMTP_USER and ' +
        'SMTP_PASS to send over SMTP.'
    );
    process.exitCode = 1;
    return;
  }

  ok(`Provider: ${env.mail.provider}`);
  ok(`From: ${env.mail.from}`);
  if (env.mail.provider === 'resend') {
    ok(`API key present (${env.mail.resendApiKey.length} chars)`);

    // Nobody can verify gmail.com, so a consumer address as the sender is
    // rejected every time. Worth catching here rather than as a 403 later.
    const sender = (env.mail.from.match(/[^\s<>]+@[^\s<>]+/) || [''])[0];
    const domain = sender.split('@')[1] || '';
    const consumer = [
      'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com',
      'hotmail.com', 'live.com', 'icloud.com', 'proton.me', 'protonmail.com',
    ];
    if (consumer.includes(domain.toLowerCase())) {
      bad(
        `MAIL_FROM is ${domain}, which cannot be verified as a sending domain`,
        'Use onboarding@resend.dev while testing (it only delivers to the ' +
          'address you signed up with), or verify a domain you own and send ' +
          'from that.'
      );
    }
  } else {
    ok(`Host: ${env.mail.host}:${env.mail.port}`);
    ok(`User: ${env.mail.user}`);
    ok(`Password present (${env.mail.pass.length} chars)`);
    console.log(
      '\n  Note: SMTP is blocked outbound on many hosting platforms. If this\n' +
        '  passes locally but times out in production, that is the cause, and\n' +
        '  RESEND_API_KEY avoids it by going out over 443.'
    );
  }

  if (!to) {
    console.log('\nNo recipient given, so nothing was sent.');
    console.log('Pass one to send a real test message:');
    console.log('  node scripts/verify_mail.js you@example.com\n');
    return;
  }

  console.log('\nDelivery');
  const started = Date.now();
  try {
    await mailer.send({
      to,
      subject: 'Fitrybe email check',
      text: 'This is a test from scripts/verify_mail.js. Delivery works.',
      html: '<p>This is a test from <code>scripts/verify_mail.js</code>. Delivery works.</p>',
    });
    ok(`Accepted for delivery to ${to} in ${Date.now() - started}ms`);
    console.log('\n  Check the inbox, and the spam folder. Being accepted is');
    console.log('  not the same as arriving.\n');
  } catch (err) {
    bad(`Could not send to ${to}`, err.message);

    if (/ETIMEDOUT|ECONNREFUSED|Could not reach/i.test(err.message)) {
      console.log(
        '\n  A connect timeout means the port never opened, so this is not a\n' +
          '  credentials problem. Either the host is wrong, or outbound SMTP is\n' +
          '  blocked here. Set RESEND_API_KEY to send over HTTPS instead.\n'
      );
    } else if (/domain|from|verif/i.test(err.message)) {
      console.log(
        '\n  Providers only let you send from a domain you have verified. Either\n' +
          '  verify the domain in MAIL_FROM, or use the provider sandbox sender\n' +
          '  while testing.\n'
      );
    }
    process.exitCode = 1;
  }
}

main();
