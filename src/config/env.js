require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

// Object storage. Configured together or not at all — a half-set bucket is a
// misconfiguration, not a fallback.
const r2 = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  // No trailing slash; object keys are appended directly.
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
};
r2.enabled = Boolean(
  r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucket && r2.publicUrl
);
// R2's S3 endpoint is derived from the account id. R2_ENDPOINT overrides it,
// which is what lets the storage layer be pointed at a local S3 stand-in for
// tests, or at another S3-compatible provider.
r2.endpoint =
  process.env.R2_ENDPOINT ||
  (r2.accountId ? `https://${r2.accountId}.r2.cloudflarestorage.com` : '');

// Local disk is a development convenience only. In production it is an
// ephemeral filesystem that loses every upload on redeploy, so uploads are
// refused there rather than written somewhere they will vanish from.
//
// This is deliberately not fatal. Storage is one subsystem, and a missing
// bucket should not be able to take down signing in, the feed, or chat along
// with it — the API keeps serving and only uploads report themselves broken.
// Google Sign-In. These are OAuth client ids, not secrets — they ship inside
// the app binary. What matters is that the backend only accepts ID tokens
// minted for *these* clients, so a token obtained for some other app cannot be
// replayed here.
//
// Android stamps the web client id into the ID token it returns; iOS stamps
// its own. Both are accepted because both are this app.
const google = {
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
  iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
};
google.audiences = [google.webClientId, google.iosClientId].filter(Boolean);
google.enabled = google.audiences.length > 0;

// Unset means the Google button returns a 503 saying so, rather than the
// server accepting tokens it cannot check. Not fatal, for the same reason
// storage is not: one broken sign-in method should not take the API down.
if (!google.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Google sign-in is NOT configured — /api/auth/social will ' +
      'reject Google tokens with 503. Set GOOGLE_WEB_CLIENT_ID and ' +
      'GOOGLE_IOS_CLIENT_ID to enable it.'
  );
}

// Sign in with Apple. The audience of an identity token is whichever client
// asked for it: the bundle identifier for the native iOS flow, a Services ID
// for the web/Android redirect flow. Both are listed so either is accepted, and
// like the Google ids neither is a secret.
const apple = {
  bundleId: process.env.APPLE_BUNDLE_ID || '',
  serviceId: process.env.APPLE_SERVICE_ID || '',
};
apple.audiences = [apple.bundleId, apple.serviceId].filter(Boolean);
apple.enabled = apple.audiences.length > 0;

// Revoking a deleted account's Apple tokens needs a signed client secret, which
// needs the private key from the Apple Developer portal. Verifying a sign-in
// does not — that uses only Apple's public keys — so these three are separate
// from the audiences above and only account deletion depends on them.
//
// APPLE_PRIVATE_KEY is the contents of the .p8 file and is a real secret. Kept
// on one line in the environment with the newlines escaped, so it is restored
// here before use.
apple.teamId = process.env.APPLE_TEAM_ID || '';
apple.keyId = process.env.APPLE_KEY_ID || '';
apple.privateKey = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
apple.canRevoke = Boolean(
  apple.teamId && apple.keyId && apple.privateKey && apple.bundleId
);

if (!apple.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Sign in with Apple is NOT configured — /api/auth/social will ' +
      'reject Apple tokens with 503. Set APPLE_BUNDLE_ID to enable it.'
  );
}

// App Review guideline 5.1.1(v) requires an app offering Sign in with Apple to
// revoke tokens when an account is deleted. Deletion still works without this,
// but the submission is out of compliance, so it is worth shouting about.
if (apple.enabled && !apple.canRevoke && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Apple token revocation is NOT configured — deleting an Apple ' +
      'account will not revoke it with Apple, which App Review requires. Set ' +
      'APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY.'
  );
}

if (!r2.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Object storage is NOT configured — image uploads will be ' +
      'rejected with 503. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL to enable them.'
  );
}

// Outgoing email, used by password reset. Deliberately plain SMTP rather than
// one vendor's API, so Resend, SendGrid, SES, Postmark or a plain mailbox all
// work by changing these four values and nothing else.
//
// Unlike the OAuth client ids above, SMTP_PASS *is* a secret.
const mail = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || 'Fitrybe <no-reply@fitrybe.app>',
};
mail.enabled = Boolean(mail.host && mail.user && mail.pass);

// Without it there is no way to deliver a reset code, so the endpoint reports
// itself unavailable rather than accepting requests it cannot honour. Not
// fatal: the rest of the API is unaffected, same as storage and sign-in.
if (!mail.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Email is NOT configured — password reset will answer 503. ' +
      'Set SMTP_HOST, SMTP_USER and SMTP_PASS to enable it.'
  );
}

module.exports = {
  nodeEnv,
  port: parseInt(process.env.PORT, 10) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  r2,
  google,
  apple,
  mail,
};
