const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized, forbidden } = require('../core/errors');

const STAFF = ['SUPERADMIN', 'ADMIN'];

/** Construye el contexto de usuario a partir de las claims firmadas del JWT. */
function userFromClaims(c) {
  const roles = Array.isArray(c.roles) ? c.roles : [];
  const isStaff = roles.some((r) => STAFF.includes(r));
  return {
    id: Number(c.sub),
    nombre: c.name,
    email: c.email,
    roles,
    permisos: new Set(c.perms || []),
    empresaId: c.emp ?? null,
    isStaff,
    isSuperAdmin: roles.includes('SUPERADMIN'),
    isClient: roles.includes('CLIENTE'),
    isTecnicoOnly: roles.includes('TECNICO') && !isStaff,
  };
}

function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const claims = jwt.verify(token, env.jwt.accessSecret, { issuer: env.jwt.issuer, algorithms: ['HS256'] });
    req.user = userFromClaims(claims);
    next();
  } catch (_) {
    next(unauthorized('Sesión expirada o inválida'));
  }
}

/** El permiso se verifica SIEMPRE en el backend. Acepta uno o varios (basta con uno). */
const requirePerm = (...perms) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (perms.some((p) => req.user.permisos.has(p))) return next();
  next(forbidden());
};

module.exports = { authenticate, requirePerm, userFromClaims };
