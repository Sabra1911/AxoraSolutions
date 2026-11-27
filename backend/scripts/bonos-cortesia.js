/**
 * Genera los bonos de cortesía "Mantenimiento preventivo gratis": 3 para jurados y 1 para el tutor.
 *   npm run bonos:cortesia            → crea (o reutiliza) la promoción y los 4 bonos, e imprime los códigos
 *   npm run bonos:cortesia -- --dias 90   → vigencia en días (por defecto 90)
 * Idempotente: si los bonos ya existen no genera códigos nuevos; solo los vuelve a mostrar.
 * Cada bono es de un solo uso y descuenta el valor del servicio SOP-001 (mantenimiento preventivo) en una cotización.
 * Los códigos son secretos de cortesía: entréguelos por canal privado a cada invitado.
 */
const crypto = require('crypto');
const db = require('../src/config/db');

const CODIGO_PROMO = 'CORTESIA-PREVENTIVO';
const SERVICIO = 'SOP-001';
const BONOS = [
  { email: 'jurado1@bono.axora.invalid', nombre: 'Jurado 1' },
  { email: 'jurado2@bono.axora.invalid', nombre: 'Jurado 2' },
  { email: 'jurado3@bono.axora.invalid', nombre: 'Jurado 3' },
  { email: 'tutor@bono.axora.invalid', nombre: 'Tutor' },
];
const newCode = () => `AXO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const out = () => ({ dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER });

async function run(dias) {
  return db.withTransaction(async (conn) => {
    const svc = await db.queryOne('SELECT ID, NOMBRE, PRECIO_BASE FROM SERVICIOS WHERE CODIGO = :c', { c: SERVICIO }, conn);
    if (!svc) throw new Error(`No existe el servicio ${SERVICIO}. Ejecute primero las migraciones.`);
    let promo = await db.queryOne('SELECT ID FROM PROMOCIONES WHERE CODIGO = :c', { c: CODIGO_PROMO }, conn);
    if (!promo) {
      const r = await db.execute(
        `INSERT INTO PROMOCIONES (NOMBRE, CODIGO, DESCRIPCION, TIPO_DESCUENTO, VALOR_DESCUENTO, MAX_BENEFICIARIOS, USOS_POR_CLIENTE, VALOR_MINIMO, FECHA_INICIO, FECHA_FIN, ACTIVA)
         VALUES (:n, :c, :d, 'VALOR', :v, 4, 1, 0, TRUNC(SYSDATE), TRUNC(SYSDATE) + :dias, 1) RETURNING ID INTO :out_id`,
        { n: 'Bono de cortesía · Mantenimiento preventivo gratis', c: CODIGO_PROMO,
          d: 'Obsequio de AXORA SOLUTIONS: un mantenimiento preventivo de computador sin costo. Un solo uso por invitado.',
          v: Math.max(Number(svc.precio_base) || 0, 1), dias, out_id: out() }, conn);
      promo = { id: r.outBinds.out_id[0] };
      await db.execute('INSERT INTO PROMOCION_SERVICIOS (PROMOCION_ID, SERVICIO_ID) VALUES (:p, :s)', { p: promo.id, s: svc.id }, conn);
    }
    const res = [];
    for (const b of BONOS) {
      let row = await db.queryOne('SELECT CODIGO_INDIVIDUAL, USUARIO_ID FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p AND LOWER(EMAIL) = :e', { p: promo.id, e: b.email }, conn);
      if (!row) {
        const codigo = newCode();
        await db.execute('INSERT INTO PROMOCION_BENEFICIARIOS (PROMOCION_ID, EMAIL, NOMBRE, CODIGO_INDIVIDUAL) VALUES (:p, :e, :n, :c)', { p: promo.id, e: b.email, n: b.nombre, c: codigo }, conn);
        row = { codigo_individual: codigo, usuario_id: null };
      }
      res.push({ nombre: b.nombre, codigo: row.codigo_individual, canjeado: !!row.usuario_id });
    }
    return { res, servicio: svc };
  });
}

if (require.main === module) {
  (async () => {
    const i = process.argv.indexOf('--dias');
    const dias = i > -1 ? Math.min(Math.max(parseInt(process.argv[i + 1], 10) || 90, 1), 365) : 90;
    await db.init();
    try {
      const { res, servicio } = await run(dias);
      console.log(`\nBonos de cortesía · ${servicio.nombre} (valor ${Number(servicio.precio_base).toLocaleString('es-CO')} COP)\n`);
      for (const r of res) console.log(`  ${r.nombre.padEnd(10)} ${r.codigo}${r.canjeado ? '  (ya reclamado)' : ''}`);
      console.log('\nEntréguelos por un canal privado. Cada invitado debe registrarse, pedir una cotización con el servicio y aplicar su código.');
    } catch (e) { console.error('Error:', e.message); process.exitCode = 1; } finally { await db.close(); }
  })();
}
module.exports = { run, BONOS, CODIGO_PROMO, SERVICIO };
