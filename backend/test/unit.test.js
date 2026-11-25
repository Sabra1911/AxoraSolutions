const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { calcularTotales } = require('../src/core/totals');
const { SOLICITUD, COTIZACION, ORDEN, MANTENIMIENTO, assertTransition, canTransition } = require('../src/core/states');
const { matchesSignature } = require('../src/middleware/upload');
const { validateRoleRules } = require('../src/modules/usuarios/module');

test('cotización: totales, IVA y descuento calculados en servidor', () => {
  const t = calcularTotales([{ cantidad: 2, precio_unitario: 50000 }, { cantidad: 1.5, precio_unitario: 10000 }], 19, 5000);
  assert.equal(t.subtotal, 115000);
  assert.equal(t.iva_valor, 20900);
  assert.equal(t.total, 130900);
  assert.equal(t.lineas[1].total_linea, 15000);
});
test('cotización: sin conceptos o descuento excesivo se rechaza', () => {
  assert.throws(() => calcularTotales([]), /al menos un concepto/);
  assert.throws(() => calcularTotales([{ cantidad: 1, precio_unitario: 100 }], 19, 500), /descuento/);
});
test('cotización: redondeo a 2 decimales', () => {
  const t = calcularTotales([{ cantidad: 3, precio_unitario: 33.333 }], 19, 0);
  assert.equal(t.subtotal, 100);
});
test('máquina de estados de solicitud', () => {
  assert.ok(canTransition(SOLICITUD, 'NUEVA', 'EN_REVISION'));
  assert.ok(canTransition(SOLICITUD, 'COTIZADA', 'AUTORIZADA'));
  assert.ok(!canTransition(SOLICITUD, 'NUEVA', 'CERRADA'));
  assert.throws(() => assertTransition(SOLICITUD, 'CERRADA', 'NUEVA'), /no permitida/);
});
test('máquina de estados de cotización: respuesta solo desde ENVIADA', () => {
  assert.ok(canTransition(COTIZACION, 'ENVIADA', 'APROBADA'));
  assert.ok(!canTransition(COTIZACION, 'BORRADOR', 'APROBADA'));
  assert.ok(!canTransition(COTIZACION, 'APROBADA', 'RECHAZADA'));
});
test('máquina de estados de orden y mantenimiento', () => {
  assert.ok(canTransition(ORDEN, 'ASIGNADA', 'EN_EJECUCION'));
  assert.ok(!canTransition(ORDEN, 'PENDIENTE', 'FINALIZADA'));
  assert.ok(!canTransition(ORDEN, 'CERRADA', 'EN_EJECUCION'));
  assert.ok(canTransition(MANTENIMIENTO, 'EN_EJECUCION', 'COMPLETADO'));
  assert.ok(!canTransition(MANTENIMIENTO, 'COMPLETADO', 'PROGRAMADO'));
});
test('adjuntos: firma de archivo debe coincidir con el MIME', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pdf = Buffer.from('%PDF-1.7\n....');
  const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
  assert.ok(matchesSignature(png, 'image/png'));
  assert.ok(matchesSignature(pdf, 'application/pdf'));
  assert.ok(!matchesSignature(exe, 'application/pdf'));
  assert.ok(!matchesSignature(png, 'image/jpeg'));
});
test('usuarios: reglas de roles y empresa', () => {
  assert.throws(() => validateRoleRules(['CLIENTE'], null), /vinculado a una empresa/);
  assert.throws(() => validateRoleRules(['CLIENTE', 'TECNICO'], 5), /no puede combinarse/);
  assert.throws(() => validateRoleRules(['TECNICO'], 5), /Solo los usuarios CLIENTE/);
  assert.doesNotThrow(() => validateRoleRules(['CLIENTE'], 5));
  assert.doesNotThrow(() => validateRoleRules(['ADMIN', 'TECNICO'], null));
});
const { parseLocalDate } = require('../src/core/dates');
test('fechas: YYYY-MM-DD se interpreta como fecha local (sin corrimiento de zona horaria)', () => {
  const d = parseLocalDate('2026-11-20');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 10); assert.equal(d.getDate(), 20); assert.equal(d.getHours(), 0);
});
