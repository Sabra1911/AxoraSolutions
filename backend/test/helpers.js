// Utilidades de prueba: variables de entorno y un "db" falso (no hay Oracle en el entorno de pruebas unitarias).
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('os').tmpdir() + '/ms-test-uploads';

const path = require('path');
const jwt = require('jsonwebtoken');

const calls = [];
const handlers = [];
const fake = {
  calls,
  /** Registra una respuesta para consultas cuyo SQL coincida con el patrón */
  on(pattern, fn) { handlers.unshift({ pattern, fn }); },
  reset() { calls.length = 0; handlers.length = 0; },
  oracledb: { BIND_OUT: 3003, NUMBER: 2010 },
  async init() {}, async close() {},
  async execute(sql, binds = {}) {
    calls.push({ sql, binds });
    const h = handlers.find((x) => x.pattern.test(sql));
    if (h) return h.fn(sql, binds) || { rows: [], rowsAffected: 1 };
    if (/^\s*INSERT/i.test(sql) && /RETURNING ID INTO/i.test(sql)) return { outBinds: { out_id: [7] }, rowsAffected: 1 };
    return { rows: [], rowsAffected: 1 };
  },
  async query(sql, binds = {}) {
    const r = await fake.execute(sql, binds);
    return (r.rows || []).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])));
  },
  async queryOne(sql, binds = {}) { return (await fake.query(sql, binds))[0] || null; },
  async withTransaction(fn) { return fn({}); },
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake, children: [], paths: [] };

const env = require('../src/config/env');
const token = (claims = {}, opts = {}) => {
  const { sub = 1, ...rest } = claims;
  return jwt.sign(
    { name: 'Prueba', email: 'p@x.co', roles: [], perms: [], emp: null, ...rest },
    opts.secret || env.jwt.accessSecret, { subject: String(sub), issuer: env.jwt.issuer, expiresIn: opts.expiresIn ?? '10m' });
};

const PERMS = {
  CLIENTE: ['empresas:read', 'servicios:read', 'equipos:read', 'solicitudes:read', 'solicitudes:create', 'solicitudes:cancel', 'cotizaciones:read', 'cotizaciones:respond', 'ordenes:read', 'mantenimientos:read', 'historial:read', 'reportes:read'],
  TECNICO: ['solicitudes:read', 'ordenes:read', 'ordenes:execute', 'mantenimientos:read', 'mantenimientos:execute', 'servicios:read'],
  ADMIN: ['empresas:read', 'empresas:write', 'usuarios:read', 'usuarios:write', 'solicitudes:read', 'solicitudes:manage', 'solicitudes:create', 'ordenes:read', 'ordenes:manage', 'ordenes:execute', 'cotizaciones:read', 'cotizaciones:write', 'cotizaciones:respond'],
};
const asCliente = (empresa = 10, sub = 100) => token({ sub, roles: ['CLIENTE'], perms: PERMS.CLIENTE, emp: empresa });
const asTecnico = (sub = 200) => token({ sub, roles: ['TECNICO'], perms: PERMS.TECNICO });
const asAdmin = (sub = 1) => token({ sub, roles: ['ADMIN'], perms: PERMS.ADMIN });

async function start() {
  const app = require('../src/app');
  const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { token: t, body } = {}) => {
    const formData = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = { ...(formData ? {} : { 'Content-Type': 'application/json' }), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
    const r = await fetch(base + url, { method, headers, body: body ? (formData ? body : JSON.stringify(body)) : undefined });
    let json = null; try { json = await r.json(); } catch (_) { /* sin cuerpo */ }
    return { status: r.status, body: json };
  };
  return { call, close: () => server.close() };
}

module.exports = { fake, token, asCliente, asTecnico, asAdmin, start, PERMS };
