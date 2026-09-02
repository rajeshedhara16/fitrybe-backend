const path = require('path');
const fs = require('fs/promises');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const env = require('../config/env');
const AppError = require('../utils/AppError');

const STORAGE_UNAVAILABLE_MESSAGE =
  'Image uploads are temporarily unavailable. Everything else still works.';

const LOCAL_ROOT = path.join(__dirname, '..', '..', 'uploads');

/**
 * Whether an upload can be stored somewhere it will still exist tomorrow.
 *
 * Development falls back to local disk, which is fine on a machine that keeps
 * its filesystem. Production has no such substitute — the container is rebuilt
 * on every deploy — so without a bucket there is nowhere durable to put a file.
 */
const isAvailable = () => env.r2.enabled || env.nodeEnv !== 'production';

let client = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.r2.endpoint,
      // R2 addresses buckets as `<endpoint>/<bucket>/<key>` and does not
      // support the virtual-hosted style the SDK defaults to.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
}

/** Absolute, publicly fetchable URL for a stored object key. */
function publicUrlFor(key) {
  if (env.r2.enabled) return `${env.r2.publicUrl}/${key}`;
  // Local dev: served by the /uploads static handler in app.js.
  return `/uploads/${key}`;
}

/**
 * The object key a stored URL points at, or null when the URL belongs to
 * somewhere else — seed data uses remote image hosts, and rows written before
 * the move to object storage still carry `/uploads/...` paths.
 */
function keyFromUrl(url) {
  if (!url) return null;

  if (env.r2.enabled && url.startsWith(`${env.r2.publicUrl}/`)) {
    return url.slice(env.r2.publicUrl.length + 1);
  }
  if (url.startsWith('/uploads/')) {
    return url.slice('/uploads/'.length);
  }
  return null;
}

/** Stores one object and returns its public URL. */
async function putObject(key, body, contentType) {
  if (!isAvailable()) {
    // Belt and braces: routes refuse the upload before it reaches here, but no
    // code path should be able to write user media to a disk that is about to
    // be discarded.
    throw new AppError(503, STORAGE_UNAVAILABLE_MESSAGE);
  }

  try {
    if (env.r2.enabled) {
      await s3().send(
        new PutObjectCommand({
          Bucket: env.r2.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Media is immutable — the filename carries a uuid, so a changed
          // image is always a new key. Let browsers and the CDN keep it for a
          // year.
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    } else {
      const target = path.join(LOCAL_ROOT, key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
    }
  } catch (err) {
    // Bad credentials, a wrong bucket name, a token without write permission,
    // a network blip. The client cannot act on any of that, but "Internal
    // server error" tells whoever is reading the logs nothing either — so name
    // the subsystem here and keep the underlying cause server-side.
    console.error(
      `[fitrybe] Storage write failed for "${key}" ` +
        `(bucket=${env.r2.bucket || 'local disk'}): ${err.name}: ${err.message}`
    );
    throw new AppError(502, 'Could not store the image. Please try again.');
  }

  return publicUrlFor(key);
}

/**
 * Best-effort removal of stored objects, given the URLs held in the database.
 * Cleanup must never fail the request that triggered it: an orphaned object
 * costs a fraction of a cent, while a failed delete would block a user from
 * removing their own post.
 */
async function deleteByUrls(urls) {
  const keys = (Array.isArray(urls) ? urls : [urls])
    .map(keyFromUrl)
    .filter(Boolean);
  if (keys.length === 0) return;

  try {
    if (env.r2.enabled) {
      // DeleteObjects caps at 1000 keys per call; a post holds at most six.
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: env.r2.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      );
    } else {
      await Promise.all(
        keys.map((key) =>
          fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {})
        )
      );
    }
  } catch (err) {
    console.error('Media cleanup failed for', keys, err);
  }
}

module.exports = {
  publicUrlFor,
  keyFromUrl,
  putObject,
  deleteByUrls,
  isAvailable,
  STORAGE_UNAVAILABLE_MESSAGE,
};
