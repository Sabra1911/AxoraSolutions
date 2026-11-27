const db = require('../config/db');

/** Registra operaciones sensibles. Un fallo de auditoría se informa en log, sin tumbar la operación. */
async function audit(ctx, accion, entidad, entidadId, detalle, conn = null) {
  try {
    const text = detalle === undefined || detalle === null ? null : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)).slice(0, 4000);
    await db.execute(
      'INSERT INTO AUDITORIA (USUARIO_ID, ACCION, ENTIDAD, ENTIDAD_ID, DETALLE, IP) VALUES (:u, :a, :e, :eid, :d, :ip)',
      { u: ctx?.user?.id ?? null, a: accion, e: entidad ?? null, eid: entidadId ?? null, d: text, ip: ctx?.ip ?? null },
      conn,
    );
  } catch (err) {
    console.error('[auditoria] no se pudo registrar:', err.message);
  }
}
module.exports = { audit };
