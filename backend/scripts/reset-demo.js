/**
 * Elimina SOLO los datos de demostración (empresas DEMO y lo que cuelga de ellas) para poder recargarlos.
 *   npm run db:demo:reset                 → vista previa: cuenta lo que se borraría, NO borra
 *   npm run db:demo:reset -- --confirmar  → borra
 *   npm run db:demo:rebuild               → borra y vuelve a cargar el seed
 * Seguridad: actúa solo sobre DEMO_COMPANIES (NIT + razón social deben coincidir); se niega con NODE_ENV=production;
 * una sola transacción (si algo falla no se borra nada); conserva las cuentas de personal demo; no borra archivos de uploads/.
 * test/demo-reset.test.js valida el orden de borrado contra las claves foráneas de las migraciones.
 */
const DEMO_COMPANIES = [
  { nit: '900123456-1', razon: 'Distribuidora Demo S.A.S.' },
  { nit: 'DEMO-NIT-002', razon: 'Oficina Demo Norte S.A.S.' },
  { nit: 'DEMO-NIT-003', razon: 'Comercio Demo Andino S.A.S.' },
  { nit: 'DEMO-NIT-004', razon: 'Bodega Demo Cúcuta S.A.S.' },
  { nit: 'DEMO-NIT-005', razon: 'Restaurante Demo El Sabor S.A.S.' },
  { nit: 'DEMO-NIT-006', razon: 'Clínica Demo Salud Integral S.A.S.' },
  { nit: 'DEMO-NIT-007', razon: 'Panadería Demo La Espiga S.A.S.' },
  { nit: 'DEMO-NIT-008', razon: 'Colegio Demo San Martín S.A.S.' },
  { nit: 'DEMO-NIT-009', razon: 'Ferretería Demo El Tornillo S.A.S.' },
  { nit: 'DEMO-NIT-010', razon: 'Droguería Demo Salud Fácil S.A.S.' },
  { nit: 'DEMO-NIT-011', razon: 'Hotel Demo Villa Real S.A.S.' },
  { nit: 'DEMO-NIT-012', razon: 'Consultorio Demo Sonrisa S.A.S.' },
  { nit: 'DEMO-NIT-013', razon: 'Despacho Contable Demo Cuentas Claras S.A.S.' },
];
const PAIRS = DEMO_COMPANIES.map((_, i) => `(:nit${i}, :rs${i})`).join(', ');
const EMP = (alias = 'EMPRESA_ID') => `${alias} IN (SELECT ID FROM EMPRESAS WHERE (NIT, RAZON_SOCIAL) IN (${PAIRS}))`;
const binds = () => Object.fromEntries(DEMO_COMPANIES.flatMap((c, i) => [[`nit${i}`, c.nit], [`rs${i}`, c.razon]]));
const USERS = `SELECT ID FROM USUARIOS WHERE ${EMP()}`;
const ORDERS = `SELECT ID FROM ORDENES_SERVICIO WHERE ${EMP()}`;
const QUOTES = `SELECT ID FROM COTIZACIONES WHERE ${EMP()}`;
const PROPOSALS = `SELECT ID FROM PROPUESTAS_ESPACIO WHERE ${EMP()}`;
const VERSIONS = `SELECT ID FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID IN (${PROPOSALS})`;

/** Plan ordenado [tabla, DELETE]: hijos primero. */
function buildPlan() {
  return [
    ['PROPUESTA_ESPACIO_SERVICIOS', `DELETE FROM PROPUESTA_ESPACIO_SERVICIOS WHERE VERSION_ID IN (${VERSIONS})`],
    ['PROPUESTA_ESPACIO_VERSIONES', `DELETE FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID IN (${PROPOSALS})`],
    ['PROPUESTAS_ESPACIO', `DELETE FROM PROPUESTAS_ESPACIO WHERE ${EMP()}`],
    ['PAGOS', `DELETE FROM PAGOS WHERE ${EMP()}`],
    ['DETALLE_ORDEN', `DELETE FROM DETALLE_ORDEN WHERE ORDEN_ID IN (${ORDERS})`],
    ['ASIGNACIONES', `DELETE FROM ASIGNACIONES WHERE ENTIDAD = 'ORDEN' AND ENTIDAD_ID IN (${ORDERS})`],
    ['ORDENES_SERVICIO', `DELETE FROM ORDENES_SERVICIO WHERE ${EMP()}`],
    ['PROMOCION_USOS', `DELETE FROM PROMOCION_USOS WHERE COTIZACION_ID IN (${QUOTES})`],
    ['DETALLE_COTIZACION', `DELETE FROM DETALLE_COTIZACION WHERE COTIZACION_ID IN (${QUOTES})`],
    ['COTIZACIONES', `DELETE FROM COTIZACIONES WHERE ${EMP()}`],
    ['MANTENIMIENTOS', `DELETE FROM MANTENIMIENTOS WHERE ${EMP()}`],
    ['CONTRATOS', `DELETE FROM CONTRATOS WHERE ${EMP()}`],
    ['ADJUNTOS', `DELETE FROM ADJUNTOS WHERE ${EMP()}`],
    ['HISTORIAL_ESTADOS', `DELETE FROM HISTORIAL_ESTADOS WHERE ${EMP()}`],
    ['NOTIFICACIONES', `DELETE FROM NOTIFICACIONES WHERE ${EMP()}`],
    ['SOLICITUDES', `DELETE FROM SOLICITUDES WHERE ${EMP()}`],
    ['EQUIPOS', `DELETE FROM EQUIPOS WHERE ${EMP()}`],
    ['CONTACTOS', `DELETE FROM CONTACTOS WHERE ${EMP()}`],
    ['SEDES', `DELETE FROM SEDES WHERE ${EMP()}`],
    ['REFRESH_TOKENS', `DELETE FROM REFRESH_TOKENS WHERE USUARIO_ID IN (${USERS})`],
    ['PASSWORD_RESETS', `DELETE FROM PASSWORD_RESETS WHERE USUARIO_ID IN (${USERS})`],
    ['USUARIO_ROL', `DELETE FROM USUARIO_ROL WHERE USUARIO_ID IN (${USERS})`],
    ['USUARIOS', `DELETE FROM USUARIOS WHERE ${EMP()}`],
    ['EMPRESAS', `DELETE FROM EMPRESAS WHERE (NIT, RAZON_SOCIAL) IN (${PAIRS})`],
  ];
}

async function main() {
  if (process.env.NODE_ENV === 'production') { console.error('Rechazado: no se reinician datos demo con NODE_ENV=production.'); process.exit(1); }
  require('dotenv').config();
  const confirm = process.argv.includes('--confirmar');
  const db = require('../src/config/db');
  await db.init();
  try {
    const found = await db.query(`SELECT NIT, RAZON_SOCIAL FROM EMPRESAS WHERE (NIT, RAZON_SOCIAL) IN (${PAIRS})`, binds());
    if (!found.length) { console.log('No hay empresas demo cargadas. Nada que borrar.'); return; }
    console.log('Empresas demo:', found.map((f) => `${f.razon_social} (${f.nit})`).join('; '));
    await db.withTransaction(async (conn) => {
      for (const [table, sql] of buildPlan()) {
        if (!confirm) {
          const n = await db.queryOne(sql.replace(/^DELETE FROM (\w+)/, 'SELECT COUNT(*) AS N FROM $1'), binds(), conn);
          console.log(`  ${table.padEnd(30)} ${n?.n ?? 0} fila(s)`);
        } else {
          const r = await db.execute(sql, binds(), conn);
          console.log(`  ${table.padEnd(30)} ${r.rowsAffected ?? 0} borrada(s)`);
        }
      }
    });
    console.log(confirm ? 'Datos demo eliminados. Ejecute `npm run db:seed` para recargarlos.' : '\nVista previa: no se borró nada. Repita con -- --confirmar para eliminar.');
  } catch (e) { console.error('Error (no se borró nada):', e.message); process.exitCode = 1; } finally { await db.close(); }
}
if (require.main === module) main();
module.exports = { buildPlan, DEMO_COMPANIES };
