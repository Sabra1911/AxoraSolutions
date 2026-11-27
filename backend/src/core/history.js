const db = require('../config/db');

async function recordState(conn, { entidad, entidadId, anterior = null, nuevo, comentario = null, usuarioId = null, empresaId = null, equipoId = null }) {
  await db.execute(
    `INSERT INTO HISTORIAL_ESTADOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, EQUIPO_ID, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO, USUARIO_ID)
     VALUES (:entidad, :entidadId, :empresaId, :equipoId, :anterior, :nuevo, :comentario, :usuarioId)`,
    { entidad, entidadId, empresaId, equipoId, anterior, nuevo, comentario: comentario ? String(comentario).slice(0, 1000) : null, usuarioId },
    conn,
  );
}
module.exports = { recordState };
