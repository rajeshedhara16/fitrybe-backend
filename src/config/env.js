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
// ephemeral filesystem that loses every upload on redeploy, so refuse to boot
// rather than quietly storing user photos somewhere they will vanish from.
if (!r2.enabled && nodeEnv === 'production') {
  throw new Error(
    'Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL.'
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
};
