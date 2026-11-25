const db = require('../../config/db');

const findUserByEmail = (email) => db.queryOne(
  `SELECT U.ID, U.EMPRESA_ID, U.EMAIL, U.NOMBRE, U.PASSWORD_HASH, U.ACTIVO, U.INTENTOS_FALLIDOS, U.BLOQUEADO_HASTA,
          E.ACTIVO AS EMPRESA_ACTIVA
     FROM USUARIOS U LEFT JOIN EMPRESAS E ON E.ID = U.EMPRESA_ID WHERE U.EMAIL = :email`, { email });

const findUserById = (id, conn) => db.queryOne(
  `SELECT U.ID, U.EMPRESA_ID, U.EMAIL, U.NOMBRE, U.TELEFONO, U.PASSWORD_HASH, U.ACTIVO, E.ACTIVO AS EMPRESA_ACTIVA, E.RAZON_SOCIAL AS EMPRESA_NOMBRE
     FROM USUARIOS U LEFT JOIN EMPRESAS E ON E.ID = U.EMPRESA_ID WHERE U.ID = :id`, { id }, conn);

async function loadAccess(userId, conn) {
  const roles = (await db.query(
    'SELECT R.CODIGO FROM USUARIO_ROL UR JOIN ROLES R ON R.ID = UR.ROL_ID WHERE UR.USUARIO_ID = :id', { id: userId }, conn)).map((r) => r.codigo);
  const perms = (await db.query(
    `SELECT DISTINCT P.CODIGO FROM USUARIO_ROL UR JOIN ROL_PERMISO RP ON RP.ROL_ID = UR.ROL_ID JOIN PERMISOS P ON P.ID = RP.PERMISO_ID
      WHERE UR.USUARIO_ID = :id`, { id: userId }, conn)).map((r) => r.codigo);
  return { roles, perms };
}

const registerFailure = (id, lockUntil) => db.execute(
  'UPDATE USUARIOS SET INTENTOS_FALLIDOS = INTENTOS_FALLIDOS + 1, BLOQUEADO_HASTA = :lockUntil WHERE ID = :id', { id, lockUntil });
const registerSuccess = (id) => db.execute(
  'UPDATE USUARIOS SET INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL, ULTIMO_ACCESO = SYSTIMESTAMP WHERE ID = :id', { id });
const getFailures = async (id) => (await db.queryOne('SELECT INTENTOS_FALLIDOS AS N FROM USUARIOS WHERE ID = :id', { id })).n;

const saveRefresh = (conn, r) => db.execute(
  `INSERT INTO REFRESH_TOKENS (USUARIO_ID, TOKEN_HASH, FAMILIA, EXPIRA_EN, IP, USER_AGENT) VALUES (:usuarioId, :hash, :familia, :expira, :ip, :ua)`,
  { usuarioId: r.usuarioId, hash: r.hash, familia: r.familia, expira: r.expira, ip: r.ip || null, ua: (r.ua || '').slice(0, 300) }, conn);
const findRefresh = (hash, conn) => db.queryOne('SELECT * FROM REFRESH_TOKENS WHERE TOKEN_HASH = :hash', { hash }, conn);
const revokeRefresh = (id, conn) => db.execute('UPDATE REFRESH_TOKENS SET REVOCADO = 1 WHERE ID = :id', { id }, conn);
const revokeFamily = (familia, conn) => db.execute('UPDATE REFRESH_TOKENS SET REVOCADO = 1 WHERE FAMILIA = :familia', { familia }, conn);
const revokeAllForUser = (usuarioId, conn) => db.execute('UPDATE REFRESH_TOKENS SET REVOCADO = 1 WHERE USUARIO_ID = :usuarioId AND REVOCADO = 0', { usuarioId }, conn);

const saveReset = (usuarioId, hash, expira) => db.execute(
  'INSERT INTO PASSWORD_RESETS (USUARIO_ID, TOKEN_HASH, EXPIRA_EN) VALUES (:usuarioId, :hash, :expira)', { usuarioId, hash, expira });
const findReset = (hash, conn) => db.queryOne('SELECT * FROM PASSWORD_RESETS WHERE TOKEN_HASH = :hash', { hash }, conn);
const useReset = (id, conn) => db.execute('UPDATE PASSWORD_RESETS SET USADO = 1 WHERE ID = :id', { id }, conn);
const setPassword = (id, hash, conn) => db.execute(
  'UPDATE USUARIOS SET PASSWORD_HASH = :hash, INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL, ACTUALIZADO_EN = SYSTIMESTAMP WHERE ID = :id', { id, hash }, conn);

module.exports = {
  findUserByEmail, findUserById, loadAccess, registerFailure, registerSuccess, getFailures,
  saveRefresh, findRefresh, revokeRefresh, revokeFamily, revokeAllForUser, saveReset, findReset, useReset, setPassword,
};
