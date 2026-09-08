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

if (!apple.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Sign in with Apple is NOT configured — /api/auth/social will ' +
      'reject Apple tokens with 503. Set APPLE_BUNDLE_ID to enable it.'
  );
}

if (!r2.enabled && nodeEnv === 'production') {
  console.error(
    '[fitrybe] Object storage is NOT configured — image uploads will be ' +
      'rejected with 503. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL to enable them.'
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
};
