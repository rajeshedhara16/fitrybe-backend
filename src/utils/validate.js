const AppError = require('./AppError');

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, 'Validation failed', result.error.flatten());
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(400, 'Validation failed', result.error.flatten());
    }
    req.validatedQuery = result.data;
    next();
  };
}

function validate({ body, query }) {
  return (req, res, next) => {
    if (body) {
      const bRes = body.safeParse(req.body);
      if (!bRes.success) {
        throw new AppError(400, 'Validation failed', bRes.error.flatten());
      }
      req.body = bRes.data;
    }
    if (query) {
      const qRes = query.safeParse(req.query);
      if (!qRes.success) {
        throw new AppError(400, 'Validation failed', qRes.error.flatten());
      }
      req.validatedQuery = qRes.data;
    }
    next();
  };
}

module.exports = validate;
module.exports.validate = validate;
module.exports.validateBody = validateBody;
module.exports.validateQuery = validateQuery;
