/**
 * Checks that object storage is actually usable with the current environment.
 *
 * Run locally after filling in .env:
 *     node scripts/verify_r2.js
 *
 * Or against the deployed environment, without copying secrets anywhere:
 *     railway run node scripts/verify_r2.js
 *
 * It writes a tiny object, reads it back over the public URL, then deletes it.
 * Nothing is printed that would expose a credential — only lengths and shapes.
 */
require('dotenv').config();

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} = require('@aws-sdk/client-s3');

const ok = (m) => console.log(`  [PASS] ${m}`);
const bad = (m, hint) => {
  console.log(`  [FAIL] ${m}`);
  if (hint) console.log(`         → ${hint}`);
  failures++;
};
let failures = 0;

const cfg = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
  endpoint: process.env.R2_ENDPOINT || '',
};

async function main() {
  console.log('--- FITRYBE R2 VERIFICATION ---\n');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || '(not set — treated as development)'}\n`);

  // ---- 1. shape checks, before we spend a network round trip ----
  console.log('Configuration');
  for (const [name, value] of Object.entries(cfg)) {
    if (name === 'endpoint') continue;
    if (!value) {
      bad(`${name} is empty`);
    }
  }
  if (failures) {
    console.log('');
    console.log('Nothing was checked - these values are blank in this environment.');
    console.log('');
    console.log('If the credentials only exist on Railway, run the check there:');
    console.log('    railway run npm run verify:r2');
    console.log('');
    console.log('Or paste the five R2_* values into .env to check and use them locally.');
    process.exit(1);
  }

  // A Cloudflare account id is 32 hex characters. So is an R2 access key id —
  // which is exactly why they get pasted into the wrong box.
  if (!/^[0-9a-f]{32}$/i.test(cfg.accountId)) {
    bad(
      `R2_ACCOUNT_ID does not look like an account id (length ${cfg.accountId.length}, expected 32 hex)`,
      'Copy it from the right-hand sidebar of the R2 page, not from the bucket or the token.'
    );
  } else {
    ok('R2_ACCOUNT_ID has the right shape');
  }

  if (!/^[0-9a-f]{32}$/i.test(cfg.accessKeyId)) {
    bad(
      `R2_ACCESS_KEY_ID looks wrong (length ${cfg.accessKeyId.length}, expected 32 hex)`,
      'This is the "Access Key ID" from the API token screen.'
    );
  } else {
    ok('R2_ACCESS_KEY_ID has the right shape');
  }

  if (cfg.secretAccessKey.length < 40) {
    bad(
      `R2_SECRET_ACCESS_KEY looks too short (length ${cfg.secretAccessKey.length}, expected 64)`,
      'It is shown only once when the token is created; regenerate if it was lost.'
    );
  } else {
    ok(`R2_SECRET_ACCESS_KEY has the right shape (length ${cfg.secretAccessKey.length})`);
  }

  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(cfg.bucket)) {
    bad(`R2_BUCKET "${cfg.bucket}" is not a valid bucket name`, 'Lowercase letters, digits and hyphens only.');
  } else {
    ok(`R2_BUCKET is "${cfg.bucket}"`);
  }

  if (!/^https?:\/\//.test(cfg.publicUrl)) {
    bad(`R2_PUBLIC_URL "${cfg.publicUrl}" must start with https://`);
  } else if (/\.r2\.cloudflarestorage\.com/.test(cfg.publicUrl)) {
    bad(
      'R2_PUBLIC_URL points at the S3 API endpoint, not the public bucket URL',
      'Use the r2.dev subdomain or your custom domain — the S3 endpoint is not publicly readable.'
    );
  } else {
    ok(`R2_PUBLIC_URL is ${cfg.publicUrl}`);
  }

  const endpoint = cfg.endpoint || `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  console.log(`  endpoint: ${endpoint}`);

  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  // ---- 2. can we reach the bucket at all ----
  console.log('\nConnectivity');
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    ok('the bucket exists and the credentials are accepted');
  } catch (err) {
    const code = err.$metadata?.httpStatusCode;
    if (code === 404) {
      bad(`bucket "${cfg.bucket}" was not found`, 'Check R2_BUCKET matches the name in the dashboard exactly.');
    } else if (code === 401 || code === 403) {
      bad(
        'the credentials were rejected',
        'Check the access key and secret, and that the token is scoped to this bucket.'
      );
    } else if (err.name === 'ENOTFOUND' || /getaddrinfo|ENOTFOUND/.test(err.message)) {
      bad(
        `the endpoint could not be resolved (${endpoint})`,
        'R2_ACCOUNT_ID is almost certainly wrong — it forms the hostname.'
      );
    } else {
      bad(`could not reach the bucket: ${err.name}: ${err.message}`);
    }
    console.log('\nStopping — nothing below can succeed until this passes.');
    process.exit(1);
  }

  // ---- 3. a real write, read and delete ----
  console.log('\nRound trip');
  const key = `_healthcheck/${Date.now()}.txt`;
  const payload = `fitrybe r2 check ${new Date().toISOString()}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: payload,
        ContentType: 'text/plain',
      })
    );
    ok('wrote a test object');
  } catch (err) {
    bad(
      `write failed: ${err.name}: ${err.message}`,
      'The API token needs "Object Read & Write", not read-only.'
    );
    process.exit(1);
  }

  try {
    const res = await fetch(`${cfg.publicUrl}/${key}`);
    if (res.status === 200) {
      const body = await res.text();
      if (body === payload) {
        ok('read it back over the public URL');
      } else {
        bad('the public URL returned different content than was written');
      }
    } else {
      bad(
        `the public URL returned ${res.status}`,
        res.status === 401 || res.status === 403
          ? 'Public access is not enabled. Bucket → Settings → enable the r2.dev subdomain, or connect a custom domain.'
          : 'Check that R2_PUBLIC_URL belongs to this bucket.'
      );
    }
  } catch (err) {
    bad(`could not fetch the public URL: ${err.message}`, 'Check R2_PUBLIC_URL is correct and reachable.');
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    ok('deleted the test object');
  } catch (err) {
    bad(`delete failed: ${err.name}: ${err.message}`, 'Uploads will work, but replaced images will not be cleaned up.');
  }

  console.log(
    failures === 0
      ? '\nObject storage is configured correctly.'
      : `\n${failures} problem(s) found — see the hints above.`
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
