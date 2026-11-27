const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { buildQuotePdf, money } = require('../src/core/quote-pdf');

const issuer = { brand: 'AXORA SOLUTIONS', tagline: 'Tu aliado tecnológico', legalName: '', nit: '', phone: '', email: '', web: '', quoteTerms: ['Condición de prueba.'], quoteExecutionTime: '', quoteWarranty: '' };
const client = { razon_social: 'Cliente de prueba S.A.S.', nit: '900000000-1', direccion: 'Calle 1', ciudad: 'Cúcuta', telefono: '', email: '', contacto: null };
const quote = (n) => ({ codigo: 'COT-000999', estado: 'ENVIADA', fecha_emision: new Date(2026, 0, 5), validez_hasta: new Date(2026, 0, 20), subtotal: 200000 * n, descuento: 0, iva_porcentaje: 19, iva_valor: 38000 * n, total: 238000 * n, notas: null,
  items: Array.from({ length: n }, (_, i) => ({ descripcion: `Servicio ${i + 1} con una descripción lo bastante larga para ocupar dos líneas dentro de la columna de la tabla`, unidad: 'm²', cantidad: 2, precio_unitario: 100000, total_linea: 200000 })) });
const render = async (q) => { const ch = []; for await (const c of buildQuotePdf({ quotation: q, client, issuer })) ch.push(c); return Buffer.concat(ch); };
const text = (buf) => { const f = path.join(os.tmpdir(), `q-${process.pid}-${Math.random()}.pdf`); fs.writeFileSync(f, buf); try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); } };

test('pdf cotización: PDF válido con logo y valores en COP', async () => {
  const buf = await render(quote(3));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-'); assert.ok(buf.length > 20000);
  const t = text(buf); assert.match(t, /COT-000999/); assert.match(t, /\$\s?714\.000/); assert.match(t, /Página 1 de 1/);
});
test('pdf cotización: varias páginas, encabezado repetido, total único y filas sin partir', async () => {
  const t = text(await render(quote(60)));
  const pages = t.split('\f').filter((p) => p.trim());
  assert.ok(pages.length >= 3);
  pages.forEach((p, i) => { assert.match(p, /COTIZACIÓN/); assert.match(p, new RegExp(`Página ${i + 1} de ${pages.length}`)); });
  assert.match(pages.at(-1), /TOTAL A PAGAR/); assert.equal((t.match(/TOTAL A PAGAR/g) || []).length, 1);
  for (const n of [1, 30, 60]) assert.equal((t.match(new RegExp(`Servicio ${n} con`, 'g')) || []).length, 1);
});
test('pdf cotización: sin líneas no falla', async () => { const q = quote(0); q.estado = 'BORRADOR'; assert.match(text(await render(q)), /no tiene líneas/); });
test('money formatea pesos colombianos', () => assert.match(money(1234567), /1\.234\.567/));
