const db = require('../config/db');

const payload = (p) => ({ tipo: p.tipo, titulo: String(p.titulo).slice(0, 200), mensaje: p.mensaje ? String(p.mensaje).slice(0, 1000) : null, enlace: p.enlace || null, empresaId: p.empresaId ?? null });

/** Notificación interna a usuarios concretos. */
async function notifyUsers(conn, userIds, p) {
  const b = payload(p);
  for (const uid of [...new Set(userIds.filter(Boolean))]) {
    await db.execute(
      `INSERT INTO NOTIFICACIONES (USUARIO_ID, EMPRESA_ID, TIPO, TITULO, MENSAJE, ENLACE) VALUES (:uid, :empresaId, :tipo, :titulo, :mensaje, :enlace)`,
      { uid, ...b }, conn,
    );
  }
}

/** Notifica a todo el personal administrativo activo (ADMIN/SUPERADMIN). */
async function notifyStaff(conn, p) {
  await db.execute(
    `INSERT INTO NOTIFICACIONES (USUARIO_ID, EMPRESA_ID, TIPO, TITULO, MENSAJE, ENLACE)
     SELECT DISTINCT U.ID, :empresaId, :tipo, :titulo, :mensaje, :enlace
       FROM USUARIOS U JOIN USUARIO_ROL UR ON UR.USUARIO_ID = U.ID JOIN ROLES R ON R.ID = UR.ROL_ID
      WHERE U.ACTIVO = 1 AND R.CODIGO IN ('ADMIN','SUPERADMIN')`,
    payload(p), conn,
  );
}

/** Notifica a los usuarios activos de una empresa cliente. */
async function notifyCompany(conn, empresaId, p) {
  await db.execute(
    `INSERT INTO NOTIFICACIONES (USUARIO_ID, EMPRESA_ID, TIPO, TITULO, MENSAJE, ENLACE)
     SELECT U.ID, :empresaId, :tipo, :titulo, :mensaje, :enlace FROM USUARIOS U WHERE U.ACTIVO = 1 AND U.EMPRESA_ID = :empresaId2`,
    { ...payload({ ...p, empresaId }), empresaId2: empresaId }, conn,
  );
}

module.exports = { notifyUsers, notifyStaff, notifyCompany };
