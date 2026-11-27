// Imagen manual de un profesional en una propuesta manual. BD simulada: valida lógica y permisos, NO ejecuta SQL contra Oracle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, asCliente, asTecnico, asAdmin, start } = require('./helpers');

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MANUAL = JSON.stringify({ modo: 'MANUAL', adecuaciones: 'Techo PVC', materiales_sugeridos: ['PVC blanco'], observaciones: ['Requiere inspección'], recomendaciones: [] });
const AI = JSON.stringify({ descripcion_espacio: 'x', adecuaciones: 'y', materiales_sugeridos: [], observaciones: [], recomendaciones: [] });
let api;

function setup(analysis = MANUAL) {
  fake.reset();
  const row = { ID: 7, EMPRESA_ID: 10, CREADO_POR: 100, ESTADO: 'ANALIZADA', FOTOGRAFIA_ARCHIVO: '2026/a.png', FOTOGRAFIA_NOMBRE: 'a.png', FOTOGRAFIA_MIME: 'image/png', FOTOGRAFIA_TAMANO: 12,
    SERVICIOS_JSON: JSON.stringify([{ clave: 'CIELO_PVC', nombre: 'PVC', codigo: 'ADE-002', servicio_id: 2 }]), OBSERVACIONES_CLIENTE: null, ANALISIS_JSON: analysis, SOLICITUD_ID: null, CREADO_EN: new Date().toISOString() };
  fake.on(/SELECT \* FROM PROPUESTAS_ESPACIO WHERE ID/, () => ({ rows: [row] }));
  fake.on(/FROM PROPUESTAS_ESPACIO WHERE ID = :id FOR UPDATE/, () => ({ rows: [{ ESTADO: 'ANALIZADA', SOLICITUD_ID: null }] }));
  fake.on(/NVL\(MAX\(NUMERO\)/, () => ({ rows: [{ NUMERO: 1 }] }));
  fake.on(/INSERT INTO PROPUESTA_ESPACIO_VERSIONES/, () => ({ outBinds: { out_id: [55] }, rowsAffected: 1 }));
  fake.on(/FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id ORDER BY NUMERO/, () => ({ rows: [{ ID: 55, NUMERO: 1, IMAGEN_MIME: 'image/png', IMAGEN_TAMANO: 12, DESCRIPCION: 'd', MATERIALES_JSON: '[]', OBSERVACIONES_JSON: '[]', RECOMENDACIONES_JSON: '[]', MODELO: 'Manual (profesional)', CREADO_EN: new Date().toISOString() }] }));
  fake.on(/FROM PROPUESTA_ESPACIO_SERVICIOS/, () => ({ rows: [] }));
  fake.on(/SELECT P\.ID, P\.ESTADO/, () => ({ rows: [] }));
}
const form = (type = 'image/png', body = png, name = 'idea.png') => { const f = new FormData(); f.append('fotografia', new Blob([body], { type }), name); f.append('descripcion', 'Así podría quedar'); return f; };
const upload = (token, f = form()) => api.call('POST', '/api/ia/espacios/7/imagen-profesional', { token, body: f });
const ran = (re) => fake.calls.some((c) => re.test(c.sql));

test.before(async () => { api = await start(); });
test.after(() => api.close());

test('administración sube una imagen a una propuesta manual: se guarda como versión «Manual (profesional)» y se avisa al cliente', async () => {
  setup();
  const r = await upload(asAdmin());
  assert.equal(r.status, 201);
  assert.equal(r.body.modelo, 'Manual (profesional)');
  const ins = fake.calls.find((c) => /INSERT INTO PROPUESTA_ESPACIO_VERSIONES/.test(c.sql));
  assert.equal(ins.binds.modelo, 'Manual (profesional)'); assert.equal(ins.binds.mime, 'image/png');
  assert.ok(ran(/INSERT INTO NOTIFICACIONES/), 'debe notificar a la empresa cliente');
});

test('el técnico también puede subirla, pero solo en propuestas manuales', async () => {
  setup();
  assert.equal((await upload(asTecnico())).status, 201);
  setup(AI);
  const r = await upload(asTecnico());
  assert.equal(r.status, 404); // para el técnico una propuesta con IA ni siquiera existe
  assert.equal(ran(/INSERT INTO PROPUESTA_ESPACIO_VERSIONES/), false);
});

test('el administrador no puede subir imagen manual a una propuesta analizada con IA', async () => {
  setup(AI);
  const r = await upload(asAdmin());
  assert.equal(r.status, 400);
  assert.equal(ran(/INSERT INTO PROPUESTA_ESPACIO_VERSIONES/), false);
});

test('el cliente no puede usar este endpoint y tampoco archivos que no son imagen', async () => {
  setup();
  assert.equal((await upload(asCliente())).status, 403);
  assert.equal((await api.call('POST', '/api/ia/espacios/7/imagen-profesional', {})).status, 401);
  assert.equal((await upload(asAdmin(), form('text/plain', Buffer.from('hola mundo'), 'x.txt'))).status, 400);
  assert.equal((await upload(asAdmin(), form('image/png', Buffer.from('no soy png'), 'falsa.png'))).status, 400);
  assert.equal(ran(/INSERT INTO PROPUESTA_ESPACIO_VERSIONES/), false);
});

test('el técnico puede leer propuestas manuales pero no crear, analizar, guardar ni eliminar', async () => {
  setup();
  assert.equal((await api.call('GET', '/api/ia/espacios/7', { token: asTecnico() })).status, 200);
  const list = await api.call('GET', '/api/ia/espacios', { token: asTecnico() });
  assert.equal(list.status, 200);
  assert.ok(fake.calls.some((c) => /P\.ANALISIS_JSON LIKE '%"modo":"MANUAL"%'/.test(c.sql)), 'el listado del técnico se limita a propuestas manuales');
  assert.equal((await api.call('POST', '/api/ia/espacios/7/manual', { token: asTecnico(), body: {} })).status, 403);
  assert.equal((await api.call('POST', '/api/ia/espacios/7/analizar', { token: asTecnico(), body: {} })).status, 403);
  assert.equal((await api.call('POST', '/api/ia/espacios/7/cotizacion', { token: asTecnico() })).status, 403);
  assert.equal((await api.call('DELETE', '/api/ia/espacios/7', { token: asTecnico() })).status, 403);
});

test('el técnico no ve propuestas hechas con IA', async () => {
  setup(AI);
  assert.equal((await api.call('GET', '/api/ia/espacios/7', { token: asTecnico() })).status, 404);
});
