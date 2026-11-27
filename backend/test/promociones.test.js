// Promociones / primeros aliados. Usa la BD simulada: valida la lógica y los permisos, NO ejecuta SQL contra Oracle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, asCliente, asAdmin, asTecnico, start } = require('./helpers');
const { computePromoDiscount, isPromoOpen } = require('../src/core/promo');

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString(); };
const PROMO = { ID: 5, NOMBRE: 'Primeros aliados', CODIGO: 'AXORAALIADO', TIPO_DESCUENTO: 'PORCENTAJE', VALOR_DESCUENTO: 15, VALOR_MINIMO: 0, USOS_POR_CLIENTE: 1, ACTIVA: 1, FECHA_INICIO: day(-1), FECHA_FIN: day(30) };
const LINES = [{ SERVICIO_ID: 1, DESCRIPCION: 'A', CANTIDAD: 2, PRECIO_UNITARIO: 100000 }, { SERVICIO_ID: 2, DESCRIPCION: 'B', CANTIDAD: 1, PRECIO_UNITARIO: 50000 }];
let api;

// Cliente de la empresa 10 con id 100; p@x.co es el correo del token de pruebas.
function setup({ promo = PROMO, quote = {}, benef = { ID: 9, PROMOCION_ID: 5, EMAIL: 'p@x.co', USUARIO_ID: null }, used = 0, serviceIds = [] } = {}) {
  fake.reset();
  fake.on(/SELECT \* FROM COTIZACIONES WHERE ID/, () => ({ rows: [{ ID: 1, EMPRESA_ID: 10, ESTADO: 'ENVIADA', DESCUENTO: 0, IVA_PORCENTAJE: 19, PROMOCION_ID: null, SOLICITUD_ID: null, ...quote }] }));
  fake.on(/SELECT ID FROM PROMOCIONES WHERE CODIGO/, (_s, b) => (b.c === promo.CODIGO ? { rows: [{ ID: promo.ID }] } : { rows: [] }));
  fake.on(/FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p AND LOWER\(EMAIL\)/, (_s, b) => (benef && b.e === String(benef.EMAIL).toLowerCase() ? { rows: [benef] } : { rows: [] }));
  fake.on(/FROM PROMOCION_BENEFICIARIOS WHERE CODIGO_INDIVIDUAL/, (_s, b) => (benef && b.c === benef.CODIGO_INDIVIDUAL ? { rows: [benef] } : { rows: [] }));
  fake.on(/SELECT \* FROM PROMOCIONES WHERE ID = :id FOR UPDATE/, () => ({ rows: [promo] }));
  fake.on(/COUNT\(\*\) AS N FROM PROMOCION_USOS/, () => ({ rows: [{ N: used }] }));
  fake.on(/SELECT SERVICIO_ID FROM PROMOCION_SERVICIOS/, () => ({ rows: serviceIds.map((s) => ({ SERVICIO_ID: s })) }));
  fake.on(/FROM DETALLE_COTIZACION WHERE COTIZACION_ID/, () => ({ rows: LINES }));
}
const apply = (token = asCliente(), codigo = 'axoraaliado') => api.call('POST', '/api/cotizaciones/1/promocion', { token, body: { codigo } });
const wrote = (re) => fake.calls.some((c) => re.test(c.sql));

test.before(async () => { api = await start(); });
test.after(() => api.close());

test('descuento porcentual, por valor, servicios excluidos y valor mínimo', () => {
  const l = [{ servicio_id: 1, total_linea: 200000 }, { servicio_id: 2, total_linea: 50000 }];
  assert.equal(computePromoDiscount({ tipo_descuento: 'PORCENTAJE', valor_descuento: 15 }, l).descuento, 37500);
  assert.equal(computePromoDiscount({ tipo_descuento: 'PORCENTAJE', valor_descuento: 15 }, l, [1]).descuento, 30000);
  assert.equal(computePromoDiscount({ tipo_descuento: 'VALOR', valor_descuento: 999999 }, l, [2]).descuento, 50000);
  assert.throws(() => computePromoDiscount({ tipo_descuento: 'PORCENTAJE', valor_descuento: 15 }, l, [99]), /no aplica/);
  assert.throws(() => computePromoDiscount({ tipo_descuento: 'PORCENTAJE', valor_descuento: 15, valor_minimo: 300000 }, l), /valor mínimo/);
});

test('vigencia: activa y dentro de fechas', () => {
  const open = { activa: 1, fecha_inicio: day(-1), fecha_fin: day(30) };
  assert.equal(isPromoOpen(open), true);
  assert.equal(isPromoOpen({ ...open, activa: 0 }), false);
  assert.equal(isPromoOpen({ activa: 1, fecha_inicio: day(1), fecha_fin: day(5) }), false);
  assert.equal(isPromoOpen({ activa: 1, fecha_inicio: day(-9), fecha_fin: day(-1) }), false);
  assert.equal(isPromoOpen({ activa: 1, fecha_inicio: day(0), fecha_fin: day(0) }), true);
});

test('beneficiario autorizado: se aplica 15 % calculado en el servidor y se reserva el uso', async () => {
  setup();
  const r = await apply();
  assert.equal(r.status, 200);
  assert.equal(r.body.subtotal, 250000);
  assert.equal(r.body.descuento, 37500);
  assert.equal(r.body.total, 252875); // (250000-37500) * 1.19
  const upd = fake.calls.find((c) => /UPDATE COTIZACIONES SET DESCUENTO/.test(c.sql));
  assert.equal(upd.binds.d, 37500); assert.equal(upd.binds.p, 5);
  assert.ok(wrote(/INSERT INTO PROMOCION_USOS/));
});

test('usuario NO autorizado no recibe descuento y el mensaje no revela si el código existe', async () => {
  setup({ benef: null });
  const r = await apply();
  assert.equal(r.status, 400);
  assert.match(r.body.error?.message || r.body.message || JSON.stringify(r.body), /no válido o no autorizado/);
  assert.equal(wrote(/UPDATE COTIZACIONES/), false);
  setup({ benef: null });
  const r2 = await apply(asCliente(), 'CODIGOINVENTADO');
  assert.equal(r2.status, 400);
  assert.match(JSON.stringify(r2.body), /no válido o no autorizado/);
});

test('un solo uso: segundo intento rechazado; promoción inactiva o vencida rechazada', async () => {
  setup({ used: 1 });
  assert.equal((await apply()).status, 409);
  assert.equal(wrote(/UPDATE COTIZACIONES/), false);
  setup({ promo: { ...PROMO, ACTIVA: 0 } });
  assert.equal((await apply()).status, 400);
  setup({ promo: { ...PROMO, FECHA_FIN: day(-1) } });
  assert.equal((await apply()).status, 400);
  assert.equal(wrote(/UPDATE COTIZACIONES/), false);
});

test('servicios excluidos, cotización ya con promoción o descuento manual', async () => {
  setup({ serviceIds: [99] });
  assert.equal((await apply()).status, 400);
  setup({ quote: { PROMOCION_ID: 5 } });
  assert.equal((await apply()).status, 409);
  setup({ quote: { DESCUENTO: 1000 } });
  assert.equal((await apply()).status, 409);
  assert.equal(wrote(/UPDATE COTIZACIONES/), false);
});

test('aislamiento: un cliente no aplica promociones a cotizaciones de otra empresa ni a borradores', async () => {
  setup({ quote: { EMPRESA_ID: 99 } });
  assert.equal((await apply()).status, 404);
  setup({ quote: { ESTADO: 'BORRADOR' } });
  assert.equal((await apply()).status, 404);
  assert.equal(wrote(/UPDATE COTIZACIONES/), false);
});

test('código individual: lo reclama quien lo usa y otra persona no puede usarlo', async () => {
  setup({ benef: { ID: 9, PROMOCION_ID: 5, EMAIL: 'otro@x.co', CODIGO_INDIVIDUAL: 'AXO-ABC123', USUARIO_ID: null } });
  assert.equal((await apply(asCliente(10, 100), 'AXO-ABC123')).status, 200);
  assert.ok(wrote(/UPDATE PROMOCION_BENEFICIARIOS SET USUARIO_ID/));
  setup({ benef: { ID: 9, PROMOCION_ID: 5, EMAIL: 'otro@x.co', CODIGO_INDIVIDUAL: 'AXO-ABC123', USUARIO_ID: 555 } });
  assert.equal((await apply(asCliente(10, 100), 'AXO-ABC123')).status, 400);
});

test('permisos de administración de promociones', async () => {
  setup();
  assert.equal((await api.call('GET', '/api/promociones')).status, 401);
  assert.equal((await api.call('GET', '/api/promociones', { token: asCliente() })).status, 403);
  assert.equal((await api.call('GET', '/api/promociones', { token: asTecnico() })).status, 403);
  assert.equal((await api.call('POST', '/api/promociones', { token: asCliente(), body: {} })).status, 403);
  assert.equal((await api.call('POST', '/api/promociones/1/beneficiarios', { token: asCliente(), body: { email: 'a@b.co' } })).status, 403);
  assert.equal((await api.call('DELETE', '/api/cotizaciones/1/promocion', { token: asCliente() })).status, 403);
  assert.equal((await api.call('GET', '/api/promociones', { token: asAdmin() })).status, 200);
});

test('validación al crear una promoción: porcentaje > 100, fechas invertidas y código inválido', async () => {
  setup();
  const ok = { nombre: 'X', codigo: 'PROMO2026', tipo_descuento: 'PORCENTAJE', valor_descuento: 10, max_beneficiarios: 5, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
  assert.equal((await api.call('POST', '/api/promociones', { token: asAdmin(), body: { ...ok, valor_descuento: 150 } })).status, 400);
  assert.equal((await api.call('POST', '/api/promociones', { token: asAdmin(), body: { ...ok, fecha_fin: '2025-01-01' } })).status, 400);
  assert.equal((await api.call('POST', '/api/promociones', { token: asAdmin(), body: { ...ok, codigo: 'a b' } })).status, 400);
});

test('máximo de beneficiarios: el décimo primero se rechaza', async () => {
  setup();
  fake.on(/FROM PROMOCIONES WHERE ID = :id FOR UPDATE/, () => ({ rows: [{ ID: 5, MAX_BENEFICIARIOS: 10 }] }));
  fake.on(/SELECT ID FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p AND EMAIL/, () => ({ rows: [] }));
  fake.on(/COUNT\(\*\) AS N FROM PROMOCION_BENEFICIARIOS/, () => ({ rows: [{ N: 10 }] }));
  const r = await api.call('POST', '/api/promociones/5/beneficiarios', { token: asAdmin(), body: { email: 'tutor11@x.co' } });
  assert.equal(r.status, 409);
  assert.equal(wrote(/INSERT INTO PROMOCION_BENEFICIARIOS/), false);
});

test('endpoint público: sin sesión, sin promoción activa devuelve null y no expone beneficiarios', async () => {
  fake.reset();
  fake.on(/FROM PROMOCIONES WHERE ACTIVA = 1/, () => ({ rows: [] }));
  const r = await api.call('GET', '/api/publico/promocion');
  assert.equal(r.status, 200); assert.equal(r.body.promocion, null);
  fake.reset();
  fake.on(/FROM PROMOCIONES WHERE ACTIVA = 1/, () => ({ rows: [{ NOMBRE: 'Aliados', DESCRIPCION: 'd', TIPO_DESCUENTO: 'PORCENTAJE', VALOR_DESCUENTO: 15, FECHA_INICIO: day(-1), FECHA_FIN: day(9), ACTIVA: 1 }] }));
  const r2 = await api.call('GET', '/api/publico/promocion');
  assert.deepEqual(Object.keys(r2.body.promocion).sort(), ['descripcion', 'fecha_fin', 'nombre', 'tipo_descuento', 'valor_descuento']);
});
