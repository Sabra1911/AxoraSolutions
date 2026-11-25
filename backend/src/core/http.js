const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valida req[source] con un esquema zod y deja el resultado en req.valid */
const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) return next(r.error);
  req.valid = r.data;
  next();
};

const ctxOf = (req) => ({ user: req.user, ip: req.ip });

module.exports = { asyncHandler, validate, ctxOf };
