const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

function makeUploader(subfolder) {
  const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'uploads', subfolder),
    filename: (req, file, cb) => {
      const ext = MIME_TO_EXT[file.mimetype];
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, uniqueName);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
      if (!MIME_TO_EXT[file.mimetype]) {
        cb(new AppError(400, 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}

function publicUrlFor(subfolder, filename) {
  return `/uploads/${subfolder}/${filename}`;
}

module.exports = { makeUploader, publicUrlFor };
