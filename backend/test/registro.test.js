// Registro público: BD simulada (no ejecuta SQL contra Oracle).
const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, start } = require('./helpers');
let api;
test.before(async () => { api = await start(); });
test.after(() => api.close());
const body = (o = {}) => ({ tipo: 'EMPRESA', nombre: 'Ana Pérez', email: 'ana@empresa.co', password: 'ClaveSegura123', nit: '900111222-3', razon_social: 'Empresa Ana SAS', ciudad: 'Cúcuta', acepta_datos: true, ...o });
const reg = (b) => api.call('POST', '/api/auth/registro', { body: b });

test.beforeEach(() => { fake.reset(); delete process.env.REGISTRO_PUBLICO; });

test('exige aceptar el tratamiento de datos y una contraseña válida', async () => {
  assert.equal((await reg(body({ acepta_datos: false }))).status, 400);
  assert.equal((await reg(body({ password: '123' }))).status, 400);
});
test('correo o NIT repetidos → 409 genérico (no revela cuál)', async () => {
  fake.on(/FROM USUARIOS WHERE EMAIL/, () => ({ rows: [{ ID: 1 }] }));
  const r = await reg(body());
  assert.equal(r.status, 409);
  assert.ok(!/correo|NIT/i.test(JSON.stringify(r.body).replace(/Si ya tiene cuenta[^"]*/, '')));
});
test('registro correcto crea empresa, sede y usuario CLIENTE SIN verificar y NO abre sesión', async () => {
  const r = await reg(body());
  assert.equal(r.status, 202, `status ${r.status} ${JSON.stringify(r.body)}`);
  assert.deepEqual(r.body, { pendiente: true });
  assert.ok(!r.body.accessToken);
  assert.ok(fake.calls.some((c) => /INSERT INTO EMPRESAS/.test(c.sql)));
  assert.ok(fake.calls.some((c) => /INSERT INTO USUARIOS[\s\S]*EMAIL_VERIFICADO[\s\S]*, 0\)/.test(c.sql)));
  assert.ok(fake.calls.some((c) => /INSERT INTO USUARIO_ROL[\s\S]*'CLIENTE'/.test(c.sql)));
  assert.ok(fake.calls.some((c) => /INSERT INTO PASSWORD_RESETS/.test(c.sql)), 'debe crear el token de activación');
});
test('activar con token válido verifica el correo; con token inválido → 400', async () => {
  fake.on(/FROM PASSWORD_RESETS WHERE TOKEN_HASH/, () => ({ rows: [{ ID: 3, USUARIO_ID: 7, USADO: 0, EXPIRA_EN: new Date(Date.now() + 3600000) }] }));
  const ok = await api.call('POST', '/api/auth/activar', { body: { token: 'x'.repeat(40) } });
  assert.equal(ok.status, 200);
  assert.ok(fake.calls.some((c) => /SET EMAIL_VERIFICADO = 1/.test(c.sql)));
  fake.reset();
  const bad = await api.call('POST', '/api/auth/activar', { body: { token: 'y'.repeat(40) } });
  assert.equal(bad.status, 400);
});
test('activar una invitación exige y fija la contraseña elegida', async () => {
  fake.on(/FROM PASSWORD_RESETS WHERE TOKEN_HASH/, () => ({ rows: [{ ID: 3, USUARIO_ID: 7, USADO: 0, EXPIRA_EN: new Date(Date.now() + 3600000) }] }));
  assert.equal((await api.call('POST', '/api/auth/activar', { body: { token: 'z'.repeat(40), password: 'corta' } })).status, 400);
  assert.equal((await api.call('POST', '/api/auth/activar', { body: { token: 'z'.repeat(40), password: 'ClaveNueva12345' } })).status, 200);
  assert.ok(fake.calls.some((c) => /SET PASSWORD_HASH/.test(c.sql)));
});
test('REGISTRO_PUBLICO=false lo deshabilita', async () => {
  process.env.REGISTRO_PUBLICO = 'false';
  assert.equal((await reg(body())).status, 403);
});
