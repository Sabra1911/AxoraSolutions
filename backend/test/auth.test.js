const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { fake } = require('./helpers');

// Repositorio de autenticación en memoria
const store = { refresh: [], users: {} };
const repoPath = require.resolve('../src/modules/auth/repo');
const user = { id: 5, empresa_id: null, email: 'u@x.co', nombre: 'U', activo: 1, empresa_activa: null, password_hash: bcrypt.hashSync('Correcta12345', 4), intentos_fallidos: 0, bloqueado_hasta: null };
require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, children: [], paths: [], exports: {
  findUserByEmail: async (e) => (e === user.email ? { ...user } : null),
  findUserById: async () => ({ ...user }),
  loadAccess: async () => ({ roles: ['ADMIN'], perms: ['usuarios:read'] }),
  registerFailure: async (id, lock) => { user.intentos_fallidos += 1; user.bloqueado_hasta = lock; },
  registerSuccess: async () => { user.intentos_fallidos = 0; user.bloqueado_hasta = null; },
  getFailures: async () => user.intentos_fallidos,
  saveRefresh: async (c, r) => { store.refresh.push({ id: store.refresh.length + 1, usuario_id: r.usuarioId, token_hash: r.hash, familia: r.familia, expira_en: r.expira, revocado: 0 }); },
  findRefresh: async (h) => store.refresh.find((x) => x.token_hash === h) || null,
  revokeRefresh: async (id) => { store.refresh.find((x) => x.id === id).revocado = 1; },
  revokeFamily: async (f) => store.refresh.filter((x) => x.familia === f).forEach((x) => { x.revocado = 1; }),
  revokeAllForUser: async () => {},
} };
const svc = require('../src/modules/auth/service');
const meta = { ip: '127.0.0.1', ua: 'test' };

test('login correcto emite access token y refresh token; el refresh se guarda solo como hash', async () => {
  const s = await svc.login('u@x.co', 'Correcta12345', meta);
  assert.ok(s.accessToken && s.refreshToken);
  assert.ok(!JSON.stringify(s.user).includes('password'));
  assert.ok(store.refresh.every((r) => r.token_hash !== s.refreshToken && r.token_hash.length === 64));
});
test('login con clave incorrecta o correo inexistente → mismo error genérico', async () => {
  await assert.rejects(svc.login('u@x.co', 'incorrecta', meta), /Credenciales inválidas/);
  await assert.rejects(svc.login('nadie@x.co', 'incorrecta', meta), /Credenciales inválidas/);
  user.intentos_fallidos = 0; user.bloqueado_hasta = null;
});
test('bloqueo tras 5 intentos fallidos', async () => {
  for (let i = 0; i < 5; i++) await assert.rejects(svc.login('u@x.co', 'mala', meta));
  assert.ok(user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date());
  await assert.rejects(svc.login('u@x.co', 'Correcta12345', meta), /bloqueada/);
  user.intentos_fallidos = 0; user.bloqueado_hasta = null;
});
test('refresh rota el token; reutilizar uno viejo invalida toda la familia', async () => {
  const s1 = await svc.login('u@x.co', 'Correcta12345', meta);
  const s2 = await svc.refresh(s1.refreshToken, meta);
  assert.notEqual(s2.refreshToken, s1.refreshToken);
  await assert.rejects(svc.refresh(s1.refreshToken, meta), /Sesión inválida/); // reutilización detectada
  await assert.rejects(svc.refresh(s2.refreshToken, meta), /Sesión inválida/); // la familia quedó revocada
});
test('refresh con token inexistente o ausente → 401', async () => {
  await assert.rejects(svc.refresh('no-existe', meta), /Sesión inválida/);
  await assert.rejects(svc.refresh(undefined, meta), /Sin sesión/);
});
test('contraseñas se almacenan con bcrypt', async () => {
  const h = await svc.hashPassword('Abcdefghij1');
  assert.match(h, /^\$2[aby]\$12\$/);
  assert.ok(await bcrypt.compare('Abcdefghij1', h));
});
