const multer = require('multer');
const AppError = require('../utils/AppError');

function notFoundHandler(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // Multer rejects oversized or unexpected files with its own error type.
  // These are client mistakes, not server faults.
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is larger than the 8MB limit'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files, or an unexpected upload field'
          : 'That upload could not be accepted';
    return res
      .status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ error: message });
  }

  if (err && err.code === 'P2002') {
    // Prisma unique constraint violation
    return res.status(409).json({
      error: 'A record with these details already exists',
      details: err.meta,
    });
  }

  if (err && err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFoundHandler, errorHandler };
