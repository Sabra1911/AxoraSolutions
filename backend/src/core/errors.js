class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
module.exports = {
  AppError,
  badRequest: (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details),
  unauthorized: (msg = 'No autenticado') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'No tiene permiso para esta operación') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = 'Registro') => new AppError(404, 'NOT_FOUND', `${what} no encontrado`),
  conflict: (msg) => new AppError(409, 'CONFLICT', msg),
};
