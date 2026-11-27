// "Solo consultar": pregunta sobre una cotización y solicitudes tipo CONSULTA. BD simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, asCliente, asTecnico, start } = require('./helpers');
let api;
test.before(async () => { api = await start(); });
test.after(() => api.close());

const quote = (estado = 'ENVIADA') => fake.on(/FROM COTIZACIONES C/, () => ({ rows: [{ ID: 1, CODIGO: 'COT-000001', EMPRESA_ID: 10, ESTADO: estado, DESCUENTO: 0, IVA_PORCENTAJE: 19 }] }));

test('el cliente puede consultar una cotización enviada sin cambiar su estado', async () => {
  fake.reset(); quote();
  const r = await api.call('POST', '/api/cotizaciones/1/consulta', { token: asCliente(), body: { mensaje: '¿Incluye repuestos?' } });
  assert.equal(r.status, 200);
  assert.ok(fake.calls.some((c) => /INSERT INTO NOTIFICACIONES/.test(c.sql)), 'debe avisar al personal');
  assert.ok(!fake.calls.some((c) => /UPDATE COTIZACIONES/.test(c.sql)), 'no debe cambiar la cotización');
});
test('no se puede consultar una cotización que no está enviada, ni con mensaje vacío, ni un técnico', async () => {
  fake.reset(); quote('APROBADA');
  assert.equal((await api.call('POST', '/api/cotizaciones/1/consulta', { token: asCliente(), body: { mensaje: 'Hola, una duda' } })).status, 400);
  fake.reset(); quote();
  assert.equal((await api.call('POST', '/api/cotizaciones/1/consulta', { token: asCliente(), body: { mensaje: '' } })).status, 400);
  assert.equal((await api.call('POST', '/api/cotizaciones/1/consulta', { token: asTecnico(), body: { mensaje: 'Hola, una duda' } })).status, 403);
});
test('una solicitud tipo CONSULTA se crea con tipo CONSULTA', async () => {
  fake.reset();
  fake.on(/FROM EMPRESAS WHERE ID/, () => ({ rows: [{ ACTIVO: 1 }] }));
  fake.on(/FROM SOLICITUDES S/, () => ({ rows: [{ ID: 7, EMPRESA_ID: 10, ESTADO: 'NUEVA', TIPO: 'CONSULTA', CODIGO: 'SOL-000007' }] }));
  const r = await api.call('POST', '/api/solicitudes', { token: asCliente(), body: { tipo: 'CONSULTA', categoria: 'REDES', asunto: '¿Instalan WiFi en dos pisos?', descripcion: 'Quisiera saber si es posible y cómo funciona.' } });
  assert.ok([200, 201].includes(r.status), `status ${r.status} ${JSON.stringify(r.body)}`);
  const ins = fake.calls.find((c) => /INSERT INTO SOLICITUDES/.test(c.sql));
  assert.ok(ins && /TIPO/.test(ins.sql));
});

test('el orden solicitado usa solo columnas conocidas (sin inyección)', async () => {
  const { createRepository } = require('../src/core/repository');
  const r = createRepository({ table: 'X', alias: 'X', columns: ['nombre', 'creado_en'], orderBy: 'X.ID' });
  fake.reset(); fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await r.list({ sort: 'nombre', dir: 'desc' });
  assert.match(fake.calls.at(-1).sql, /ORDER BY X\.NOMBRE DESC, X\.ID/);
  fake.reset(); fake.on(/COUNT\(\*\)/, () => ({ rows: [{ N: 0 }] }));
  await r.list({ sort: 'nombre; DROP TABLE X', dir: 'asc' });
  assert.ok(!/DROP/.test(fake.calls.at(-1).sql) && /ORDER BY X\.ID/.test(fake.calls.at(-1).sql));
});
