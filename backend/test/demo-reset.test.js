// Valida el plan de borrado del reset demo contra el grafo REAL de claves foráneas de las migraciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { buildPlan, DEMO_COMPANIES } = require('../scripts/reset-demo');

const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const tables = [...sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\)\s*\n/g)];
const fks = new Map(tables.map(([, n, b]) => [n, new Set([...b.matchAll(/REFERENCES (\w+)\(/g)].map((m) => m[1]).filter((t) => t !== n))]));

test('reset demo: el orden de borrado respeta las claves foráneas (hijos antes que padres)', () => {
  const order = buildPlan().map(([t]) => t);
  assert.equal(new Set(order).size, order.length);
  order.forEach((table, i) => {
    assert.ok(fks.has(table), `la tabla ${table} no existe en las migraciones`);
    for (const [child, parents] of fks) if (parents.has(table) && order.includes(child)) assert.ok(order.indexOf(child) < i, `${child} referencia a ${table} y debe borrarse antes`);
  });
});
test('reset demo: cubre toda tabla con EMPRESA_ID y ninguna sentencia borra sin filtro', () => {
  const planned = new Set(buildPlan().map(([t]) => t));
  for (const [, n, b] of tables) if (/EMPRESA_ID/.test(b)) assert.ok(planned.has(n), `falta ${n} en el plan`);
  for (const [t, stmt] of buildPlan()) assert.match(stmt, /WHERE/, `${t} sin WHERE`);
  assert.ok(DEMO_COMPANIES.every((c) => c.nit && c.razon));
});
