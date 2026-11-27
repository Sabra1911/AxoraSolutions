const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { fake, token, asCliente, asTecnico, asAdmin, start } = require('./helpers');

let api;
test.before(async () => { api = await start(); });
test.after(() => api.close());
test.beforeEach(() => fake.reset());

test('sin token → 401', async () => {
  assert.equal((await api.call('GET', '/api/solicitudes')).status, 401);
});
test('token manipulado, con otro secreto o expirado → 401', async () => {
  const bad = token({ sub: 1, roles: ['ADMIN'], perms: ['usuarios:read'] }, { secret: 'otro-secreto-otro-secreto-otro-secreto-xx' });
  assert.equal((await api.call('GET', '/api/usuarios', { token: bad })).status, 401);
  const expired = token({ sub: 1, roles: ['ADMIN'], perms: ['usuarios:read'] }, { expiresIn: -10 });
  assert.equal((await api.call('GET', '/api/usuarios', { token: expired })).status, 401);
  const none = jwt.sign({ sub: '1', roles: ['SUPERADMIN'], perms: ['usuarios:read'] }, '', { algorithm: 'none' });
  assert.equal((await api.call('GET', '/api/usuarios', { token: none })).status, 401);
});
test('permisos verificados en backend: CLIENTE no gestiona usuarios ni empresas', async () => {
  const t = asCliente();
  assert.equal((await api.call('GET', '/api/usuarios', { token: t })).status, 403);
  assert.equal((await api.call('POST', '/api/empresas', { token: t, body: { nit: '1', razon_social: 'X' } })).status, 403);
  assert.equal((await api.call('POST', '/api/equipos', { token: t, body: {} })).status, 403);
  assert.equal((await api.call('POST', '/api/servicios', { token: t, body: {} })).status, 403);
});
test('permisos: TECNICO no accede a empresas, cotizaciones ni dashboard global', async () => {
  const t = asTecnico();
  assert.equal((await api.call('GET', '/api/empresas', { token: t })).status, 403);
  assert.equal((await api.call('GET', '/api/cotizaciones', { token: t })).status, 403);
  assert.equal((await api.call('POST', '/api/ordenes', { token: t, body: { solicitud_id: 1 } })).status, 403);
  assert.equal((await api.call('GET', '/api/reportes/dashboard', { token: t })).status, 403);
});
test('aislamiento: el listado de un CLIENTE siempre filtra por la empresa de su token, aunque envíe otra', async () => {
  fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  const r = await api.call('GET', '/api/solicitudes?empresa_id=999', { token: asCliente(10) });
  assert.equal(r.status, 200);
  const sel = fake.calls.find((c) => /FROM SOLICITUDES S/.test(c.sql) && /OFFSET/.test(c.sql));
  assert.match(sel.sql, /S\.EMPRESA_ID = :s_empresa_id/);
  assert.equal(sel.binds.s_empresa_id, 10);
});
test('aislamiento: detalle de solicitud ajena devuelve 404 (el scope se aplica en SQL)', async () => {
  const r = await api.call('GET', '/api/solicitudes/55', { token: asCliente(10) });
  assert.equal(r.status, 404);
  const sel = fake.calls.find((c) => /FROM SOLICITUDES S/.test(c.sql));
  assert.equal(sel.binds.s_empresa_id, 10);
});
test('aislamiento: un TECNICO solo ve órdenes asignadas a su usuario', async () => {
  fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await api.call('GET', '/api/ordenes?tecnico_id=999', { token: asTecnico(200) });
  const sel = fake.calls.find((c) => /FROM ORDENES_SERVICIO O/.test(c.sql) && /OFFSET/.test(c.sql));
  assert.match(sel.sql, /O\.TECNICO_ID = :s_tecnico_id/);
  assert.equal(sel.binds.s_tecnico_id, 200);
});
test('crear solicitud: el empresa_id del cuerpo se ignora para clientes', async () => {
  fake.on(/FROM EMPRESAS WHERE ID/, () => ({ rows: [{ ACTIVO: 1 }] }));
  fake.on(/FROM SOLICITUDES S/, (sql, b) => ({ rows: [{ ID: 7, EMPRESA_ID: b.s_empresa_id ?? 10, ESTADO: 'NUEVA', CODIGO: 'SOL-000007' }] }));
  const r = await api.call('POST', '/api/solicitudes', { token: asCliente(10), body: { empresa_id: 999, categoria: 'REDES', asunto: 'Sin internet', descripcion: 'No hay red en la sede' } });
  assert.equal(r.status, 201);
  const ins = fake.calls.find((c) => /INSERT INTO SOLICITUDES/.test(c.sql));
  assert.equal(ins.binds.b_empresa_id, 10);
  assert.equal(ins.binds.b_estado, 'NUEVA');
  assert.equal(ins.binds.b_solicitante_id, 100);
});
test('crear solicitud: equipo de otra empresa se rechaza', async () => {
  fake.on(/FROM EMPRESAS WHERE ID/, () => ({ rows: [{ ACTIVO: 1 }] }));
  fake.on(/FROM EQUIPOS WHERE ID/, () => ({ rows: [{ EMPRESA_ID: 77, SEDE_ID: null }] }));
  const r = await api.call('POST', '/api/solicitudes', { token: asCliente(10), body: { equipo_id: 5, categoria: 'REDES', asunto: 'x', descripcion: 'y' } });
  assert.equal(r.status, 400);
  assert.ok(!fake.calls.some((c) => /INSERT INTO SOLICITUDES/.test(c.sql)));
});
test('validación centralizada: datos inválidos → 400 con detalle por campo', async () => {
  const r = await api.call('POST', '/api/solicitudes', { token: asCliente(), body: { categoria: 'INEXISTENTE', asunto: '' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION');
  assert.ok(r.body.error.details.length >= 2);
});
test('SQL injection: el término de búsqueda viaja como bind, nunca concatenado', async () => {
  fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await api.call('GET', `/api/empresas?q=${encodeURIComponent("x' OR 1=1 --")}`, { token: asAdmin() });
  const sel = fake.calls.find((c) => /FROM EMPRESAS E/.test(c.sql) && /OFFSET/.test(c.sql));
  assert.ok(!sel.sql.includes('1=1'));
  assert.equal(sel.binds.q, "%X' OR 1=1 --%");
});
test('la lista de usuarios nunca incluye password_hash', async () => {
  fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await api.call('GET', '/api/usuarios', { token: asAdmin() });
  const sel = fake.calls.find((c) => /FROM USUARIOS U/.test(c.sql) && /OFFSET/.test(c.sql));
  assert.ok(!/PASSWORD_HASH/i.test(sel.sql));
});
test('ADMIN no puede crear SUPERADMIN', async () => {
  const r = await api.call('POST', '/api/usuarios', { token: asAdmin(), body: { email: 'a@b.co', nombre: 'X', roles: ['SUPERADMIN'], password: 'Abcdefghij1' } });
  assert.equal(r.status, 403);
});
test('cliente no puede aprobar cotización de otra empresa (404)', async () => {
  const r = await api.call('POST', '/api/cotizaciones/9/respuesta', { token: asCliente(10), body: { aprobada: true } });
  assert.equal(r.status, 404);
  assert.ok(!fake.calls.some((c) => /UPDATE COTIZACIONES SET/.test(c.sql)));
});
test('cliente no ve cotizaciones en borrador (filtro por identidad)', async () => {
  fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await api.call('GET', '/api/cotizaciones?estado=BORRADOR', { token: asCliente(10) });
  const sel = fake.calls.find((c) => /FROM COTIZACIONES C/.test(c.sql) && /OFFSET/.test(c.sql));
  assert.match(sel.sql, /C\.ESTADO <> :n_estado/);
  assert.equal(sel.binds.n_estado, 'BORRADOR');
});
test('técnico no puede finalizar una orden que no es suya', async () => {
  const r = await api.call('POST', '/api/ordenes/4/finalizar', { token: asTecnico(200) });
  assert.equal(r.status, 404); // el scope por tecnico_id oculta la orden ajena
});
test('adjuntos: sin token → 401; entidad inválida → 400', async () => {
  assert.equal((await api.call('GET', '/api/adjuntos/SOLICITUD/1')).status, 401);
  assert.equal((await api.call('GET', '/api/adjuntos/FOO/1', { token: asAdmin() })).status, 400);
});
test('ruta inexistente → 404 JSON', async () => {
  assert.equal((await api.call('GET', '/api/nada', { token: asAdmin() })).status, 404);
});
