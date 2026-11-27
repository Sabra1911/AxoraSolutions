const test = require('node:test');
const assert = require('node:assert/strict');
const { fake } = require('./helpers');
const { run, BONOS } = require('../scripts/bonos-cortesia');

test('crea la promoción de cortesía restringida a SOP-001 y 4 bonos únicos', async () => {
  fake.reset();
  fake.on(/FROM SERVICIOS WHERE CODIGO/, () => ({ rows: [{ ID: 3, NOMBRE: 'Mantenimiento de computadores', PRECIO_BASE: 60000 }] }));
  const { res } = await run(90);
  assert.equal(res.length, 4);
  assert.equal(new Set(res.map((r) => r.codigo)).size, 4);
  assert.ok(res.every((r) => /^AXO-[0-9A-F]{10}$/.test(r.codigo)));
  const promo = fake.calls.find((c) => /INSERT INTO PROMOCIONES/.test(c.sql));
  assert.ok(/'VALOR'/.test(promo.sql) && promo.binds.v === 60000);
  assert.ok(fake.calls.some((c) => /INSERT INTO PROMOCION_SERVICIOS/.test(c.sql)));
  assert.equal(fake.calls.filter((c) => /INSERT INTO PROMOCION_BENEFICIARIOS/.test(c.sql)).length, BONOS.length);
});
test('es idempotente: si ya existen, reutiliza los códigos y no inserta', async () => {
  fake.reset();
  fake.on(/FROM SERVICIOS WHERE CODIGO/, () => ({ rows: [{ ID: 3, NOMBRE: 'X', PRECIO_BASE: 60000 }] }));
  fake.on(/FROM PROMOCIONES WHERE CODIGO/, () => ({ rows: [{ ID: 9 }] }));
  fake.on(/FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID/, () => ({ rows: [{ CODIGO_INDIVIDUAL: 'AXO-AAAAAAAAAA', USUARIO_ID: null }] }));
  const { res } = await run(90);
  assert.ok(res.every((r) => r.codigo === 'AXO-AAAAAAAAAA'));
  assert.ok(!fake.calls.some((c) => /^\s*INSERT/.test(c.sql)));
});
