// Modo manual del Diseñador de espacios (sin IA). Usa la BD simulada del proyecto: valida la lógica y los permisos,
// NO ejecuta SQL contra Oracle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fake, asCliente, start } = require('./helpers');
const env = require('../src/config/env');
const { UPLOAD_ROOT } = require('../src/middleware/upload');
const solicitudes = require('../src/modules/solicitudes/module').service;

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const realFetch = global.fetch;
const savedKey = env.ai.geminiApiKey;
const origCreate = solicitudes.createRecord; const origGet = solicitudes.get;
const stored = [];
let api; let row;

const CATALOG = [
  { ID: 2, CODIGO: 'ADE-002', LINEA: 'ADECUACIONES', NOMBRE: 'Instalación de PVC en techos', DESCRIPCION: 'Cielo raso', PRECIO_BASE: 60000, UNIDAD: 'metro' },
  { ID: 1, CODIGO: 'ADE-001', LINEA: 'ADECUACIONES', NOMBRE: 'Instalación de PVC/WPC marmolizado en paredes', DESCRIPCION: 'Panel', PRECIO_BASE: 50000, UNIDAD: 'metro' },
];

function configureDb() {
  row = null;
  fake.on(/SELECT ID FROM EMPRESAS/, () => ({ rows: [{ ID: 10 }] }));
  fake.on(/SELECT ID, CODIGO, LINEA, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD\s+FROM SERVICIOS/, () => ({ rows: CATALOG }));
  fake.on(/INSERT INTO PROPUESTAS_ESPACIO/, (_sql, b) => {
    row = { ID: 7, EMPRESA_ID: b.empresa, CREADO_POR: b.usuario, ESTADO: 'BORRADOR', FOTOGRAFIA_ARCHIVO: b.archivo, FOTOGRAFIA_NOMBRE: b.nombre, FOTOGRAFIA_MIME: b.mime, FOTOGRAFIA_TAMANO: b.tamano,
      SERVICIOS_JSON: null, OBSERVACIONES_CLIENTE: null, ANALISIS_JSON: null, SOLICITUD_ID: null, CREADO_EN: new Date().toISOString() };
    stored.push(path.resolve(UPLOAD_ROOT, b.archivo));
    return { outBinds: { out_id: [7] }, rowsAffected: 1 };
  });
  fake.on(/SELECT \* FROM PROPUESTAS_ESPACIO WHERE ID/, (_s, b) => (!row || row.ID !== b.id || (b.empresa && row.EMPRESA_ID !== b.empresa) ? { rows: [] } : { rows: [row] }));
  fake.on(/FROM PROPUESTAS_ESPACIO WHERE ID = :id[\s\S]*FOR UPDATE/, (_s, b) => (!row || row.ID !== b.id ? { rows: [] } : { rows: [row] }));
  fake.on(/UPDATE PROPUESTAS_ESPACIO\s+SET SERVICIOS_JSON/, (_s, b) => {
    if (!row || row.SOLICITUD_ID) return { rowsAffected: 0 };
    Object.assign(row, { SERVICIOS_JSON: b.servicios, OBSERVACIONES_CLIENTE: b.observaciones, ANALISIS_JSON: b.analisis, ESTADO: 'ANALIZADA' });
    return { rowsAffected: 1 };
  });
  fake.on(/UPDATE PROPUESTAS_ESPACIO\s+SET SOLICITUD_ID/, (_s, b) => { row.SOLICITUD_ID = b.solicitud; row.ESTADO = 'SOLICITUD_CREADA'; return { rowsAffected: 1 }; });
  fake.on(/FROM PROPUESTA_ESPACIO_VERSIONES/, () => ({ rows: [] }));
  fake.on(/FROM PROPUESTA_ESPACIO_SERVICIOS/, () => ({ rows: [] }));
}

const form = () => { const f = new FormData(); f.append('fotografia', new Blob([png], { type: 'image/png' }), 'espacio.png'); return f; };
const good = { servicios: [{ clave: 'CIELO_PVC', especificaciones: 'Blanco mate' }, { clave: 'PANELES_DECORATIVOS', especificaciones: 'Pared principal' }], descripcion: 'Techo PVC moderno y paneles en la pared principal con LED empotrado', materiales: ['PVC blanco', 'Perfilería'], observaciones: 'Conservar la ventana' };
const createProposal = async () => { const r = await api.call('POST', '/api/ia/espacios', { token: asCliente(), body: form() }); assert.equal(r.status, 201); return r.body; };

test.before(async () => { api = await start(); });
test.after(async () => {
  global.fetch = realFetch; env.ai.geminiApiKey = savedKey; solicitudes.createRecord = origCreate; solicitudes.get = origGet;
  for (const f of stored) { try { await fs.promises.unlink(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  await api.close();
});
test.beforeEach(() => { fake.reset(); global.fetch = realFetch; env.ai.geminiApiKey = ''; solicitudes.createRecord = origCreate; solicitudes.get = origGet; configureDb(); });

test('manual: guarda servicios y descripción SIN clave de IA y sin llamar a ningún proveedor', async () => {
  let provider = false;
  global.fetch = async (url, o) => { if (/googleapis|openai/.test(String(url))) { provider = true; throw new Error('no debe llamar al proveedor'); } return realFetch(url, o); };
  await createProposal();
  const r = await api.call('POST', '/api/ia/espacios/7/manual', { token: asCliente(), body: good });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'ANALIZADA');
  assert.equal(r.body.analisis.modo, 'MANUAL');
  assert.equal(r.body.analisis.adecuaciones, good.descripcion);
  assert.deepEqual(r.body.analisis.materiales_sugeridos, ['PVC blanco', 'Perfilería']);
  assert.deepEqual(r.body.servicios.map((s) => s.clave), ['CIELO_PVC', 'PANELES_DECORATIVOS']);
  assert.equal(r.body.versiones.length, 0);                       // nunca se inventa una imagen
  assert.equal(provider, false);
  assert.equal(fake.calls.some((c) => /CONSENTIMIENTO_GEMINI_EN/.test(c.sql) && /UPDATE/.test(c.sql)), false);   // no registra consentimiento de IA
});

test('manual: valida los datos (descripción, servicios y campos desconocidos)', async () => {
  await createProposal();
  const call = (body) => api.call('POST', '/api/ia/espacios/7/manual', { token: asCliente(), body });
  assert.equal((await call({ ...good, descripcion: 'corta' })).status, 400);
  assert.equal((await call({ ...good, servicios: [] })).status, 400);
  assert.equal((await call({ ...good, campo_extra: 1 })).status, 400);
  assert.equal((await call({ ...good, materiales: Array(7).fill('x') })).status, 400);
  assert.equal((await call({ ...good, servicios: [{ clave: 'CIELO_PVC' }, { clave: 'CIELO_PVC' }] })).status, 400);   // servicio repetido
});

test('manual: exige sesión y permiso, y respeta el aislamiento por empresa', async () => {
  await createProposal();
  assert.equal((await api.call('POST', '/api/ia/espacios/7/manual', { body: good })).status, 401);
  assert.equal((await api.call('POST', '/api/ia/espacios/7/manual', { token: asCliente(11), body: good })).status, 404);   // otra empresa
  assert.equal((await api.call('POST', '/api/ia/espacios/abc/manual', { token: asCliente(), body: good })).status, 400);
});

test('manual: la solicitud de cotización se crea sin imagen generada y adjunta solo la fotografía original', async () => {
  await createProposal();
  await api.call('POST', '/api/ia/espacios/7/manual', { token: asCliente(), body: good });
  let created;
  solicitudes.createRecord = async (_ctx, d) => { created = d; return 55; };
  solicitudes.get = async () => ({ id: 55 });
  const r = await api.call('POST', '/api/ia/espacios/7/cotizacion', { token: asCliente() });
  assert.equal(r.status, 201);
  assert.equal(r.body.solicitud_id, 55);
  assert.match(created.descripcion, /elaborada manualmente \(sin imagen generada por IA\)/);
  assert.match(created.descripcion, /Instalación de PVC en techos \(Blanco mate\)/);
  assert.match(created.descripcion, /Materiales indicados: PVC blanco; Perfilería/);
  assert.equal(fake.calls.filter((c) => /INSERT INTO ADJUNTOS/.test(c.sql)).length, 1);   // solo la foto original
  assert.equal(row.ESTADO, 'SOLICITUD_CREADA');
  assert.equal(row.SOLICITUD_ID, 55);
  const again = await api.call('POST', '/api/ia/espacios/7/cotizacion', { token: asCliente() });   // no se duplica
  assert.equal(again.status, 409);
});

test('manual: un análisis de IA sin imagen generada sigue sin poder cotizarse', async () => {
  await createProposal();
  Object.assign(row, { ESTADO: 'ANALIZADA', ANALISIS_JSON: JSON.stringify({ descripcion_espacio: 'sala', elementos_visibles: [], adecuaciones: 'techo', materiales_sugeridos: [], observaciones: [], recomendaciones: [] }), SERVICIOS_JSON: '[]' });
  const r = await api.call('POST', '/api/ia/espacios/7/cotizacion', { token: asCliente() });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /propuesta visual o guarde una propuesta manual/);
});
