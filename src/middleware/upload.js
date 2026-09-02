const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const AppError = require('../utils/AppError');
const {
  putObject,
  isAvailable,
  STORAGE_UNAVAILABLE_MESSAGE,
} = require('../services/storage');

// What the bytes must actually decode to. The declared Content-Type is only
// a hint — plenty of HTTP clients (Dart's `MultipartFile.fromPath` among them)
// send `application/octet-stream` for everything, and a hostile one can claim
// whatever it likes. The real gate is `sniff` below.
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

// Headers we accept at the multer stage. Anything image-shaped, plus the
// generic binary type that means "the client did not say".
const ACCEPTED_MIME_PREFIXES = ['image/'];
const ACCEPTED_MIME_EXACT = new Set(['application/octet-stream']);

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * Longest edge, in pixels, that each kind of image is stored at, plus the
 * thumbnail size where a smaller copy is worth having.
 *
 * Phone cameras hand us 4000px images. Storing them untouched made a feed of
 * ten photo posts pull well over 100MB on a mobile connection, so everything
 * is downscaled and re-encoded to WebP on the way in.
 */
const PRESETS = {
  avatars: { max: 512, thumb: 128 },
  banners: { max: 1600 },
  trybes: { max: 800, thumb: 256 },
  posts: { max: 1600, thumb: 400 },
  chat: { max: 1280 },
};

const WEBP_QUALITY = 82;

function uniqueKey(subfolder, suffix = '') {
  return `${subfolder}/${Date.now()}-${crypto.randomUUID()}${suffix}.webp`;
}

/**
 * Downscales and re-encodes one image, then stores the display copy and, when
 * the preset asks for one, a thumbnail.
 *
 * `withoutEnlargement` means a small image is never upscaled. Metadata is
 * dropped on the way through — sharp discards it unless asked otherwise — so
 * the EXIF block never reaches the bucket. On a phone photo that block carries
 * the GPS coordinates where the picture was taken, and serving it publicly
 * would leak a user's home address from their own avatar.
 */
async function processImage(subfolder, file) {
  const preset = PRESETS[subfolder] || { max: 1600 };

  // Decode the header to find out what this really is. This both validates the
  // upload and tells us whether it is an animated image, which the declared
  // Content-Type cannot be trusted to reveal.
  let meta;
  try {
    meta = await sharp(file.buffer).metadata();
  } catch (err) {
    throw new AppError(400, 'That file is not a readable image');
  }
  if (!ALLOWED_FORMATS.has(meta.format)) {
    throw new AppError(400, 'Only JPEG, PNG, WEBP, or GIF images are allowed');
  }

  const animated = (meta.pages || 1) > 1;

  const base = () =>
    // `rotate()` bakes in the EXIF orientation so the image still faces the
    // right way once the tag itself is gone.
    sharp(file.buffer, { animated }).rotate();

  let display;
  try {
    display = await base()
      .resize({
        width: preset.max,
        height: preset.max,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new AppError(400, 'That image could not be processed');
  }

  const key = uniqueKey(subfolder);
  const url = await putObject(key, display, 'image/webp');

  let thumbUrl = null;
  if (preset.thumb) {
    try {
      const thumb = await base()
        .resize({
          width: preset.thumb,
          height: preset.thumb,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      thumbUrl = await putObject(
        key.replace(/\.webp$/, '-thumb.webp'),
        thumb,
        'image/webp'
      );
    } catch (err) {
      // A missing thumbnail degrades to showing the full image, which is
      // better than failing the whole upload.
      console.error('Thumbnail generation failed', err);
    }
  }

  return { url, thumbUrl, key };
}

const multerInstance = multer({
  // Buffered in memory so sharp can work on the bytes before anything is
  // written anywhere. Files are capped at 8MB, and posts at six of them.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    // Refuse here rather than after buffering 8MB we have nowhere to put.
    // Requests carrying no file never reach this, so a caption-only post or a
    // Trybe without a picture still goes through with storage down.
    if (!isAvailable()) {
      cb(new AppError(503, STORAGE_UNAVAILABLE_MESSAGE));
      return;
    }

    const mime = (file.mimetype || '').toLowerCase();
    const plausible =
      ACCEPTED_MIME_EXACT.has(mime) ||
      ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
    if (!plausible) {
      cb(new AppError(400, 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
      return;
    }
    // Anything that gets past here still has to decode as a real image in
    // processImage before a single byte is stored.
    cb(null, true);
  },
});

/**
 * Returns the middleware pair for one upload field: multer to receive the
 * bytes, then processing that leaves the stored results on `req.uploads`.
 *
 * Spread into a route: `router.post('/', ...uploader.single('avatar'), handler)`
 */
function makeUploader(subfolder) {
  const store = async (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);
    req.uploads = [];
    for (const file of files) {
      req.uploads.push(await processImage(subfolder, file));
    }
    next();
  };

  return {
    single: (field) => [multerInstance.single(field), store],
    array: (field, max) => [multerInstance.array(field, max), store],
  };
}

module.exports = { makeUploader };
