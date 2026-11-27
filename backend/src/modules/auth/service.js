const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const db = require('../../config/db');
const repo = require('./repo');
const { unauthorized, badRequest, conflict, AppError } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { sendMail } = require('../../integrations/mailer');

const MAX_FAILS = 5;
const LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(48).toString('base64url');
const hashPassword = (pw) => bcrypt.hash(pw, 12);

function signAccess(user, access) {
  return jwt.sign(
    { name: user.nombre, email: user.email, roles: access.roles, perms: access.perms, emp: user.empresa_id ?? null },
    env.jwt.accessSecret,
    { subject: String(user.id), expiresIn: env.jwt.accessTtl, issuer: env.jwt.issuer, algorithm: 'HS256' },
  );
}

async function issueSession(user, meta, familia, conn) {
  const access = await repo.loadAccess(user.id, conn);
  const refresh = newToken();
  await repo.saveRefresh(conn, {
    usuarioId: user.id, hash: sha256(refresh), familia: familia || crypto.randomUUID(),
    expira: new Date(Date.now() + env.refreshTtlDays * 86400000), ip: meta.ip, ua: meta.ua,
  });
  return { accessToken: signAccess(user, access), refreshToken: refresh, user: publicUser(user, access) };
}

const publicUser = (u, access) => ({
  id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono ?? null, empresaId: u.empresa_id ?? null,
  empresaNombre: u.empresa_nombre ?? null, roles: access.roles, permisos: access.perms,
});

async function login(email, password, meta) {
  const user = await repo.findUserByEmail(email.trim().toLowerCase());
  const ctx = { user: user ? { id: user.id } : null, ip: meta.ip };
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // iguala tiempos de respuesta
    await audit(ctx, 'LOGIN_FALLIDO', 'USUARIO', null, { email });
    throw unauthorized('Credenciales inválidas');
  }
  if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
    throw new AppError(423, 'LOCKED', 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok || !user.activo || (user.empresa_id && !user.empresa_activa)) {
    if (!ok) {
      const fails = (await repo.getFailures(user.id)) + 1;
      await repo.registerFailure(user.id, fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null);
    }
    await audit(ctx, 'LOGIN_FALLIDO', 'USUARIO', user.id, { motivo: ok ? 'inactivo' : 'clave' });
    throw unauthorized('Credenciales inválidas');
  }
  if (user.email_verificado === 0) {
    await audit(ctx, 'LOGIN_SIN_ACTIVAR', 'USUARIO', user.id);
    throw new AppError(403, 'EMAIL_NO_VERIFICADO', 'Debe activar su cuenta con el enlace enviado a su correo. Si no lo recibió, solicite uno nuevo.');
  }
  await repo.registerSuccess(user.id);
  const full = await repo.findUserById(user.id);
  const session = await db.withTransaction((conn) => issueSession(full, meta, null, conn));
  await audit({ user: { id: user.id }, ip: meta.ip }, 'LOGIN', 'USUARIO', user.id);
  return session;
}


/**
 * Registro público de un cliente (empresa o persona) con rol CLIENTE. Crea empresa + sede principal + contacto + usuario en una transacción
 * y abre sesión. No revela si el correo o el NIT ya existen (mensaje genérico) para no permitir sondeo de cuentas.
 */
async function register(d, meta) {
  if (process.env.REGISTRO_PUBLICO === 'false') throw new AppError(403, 'REGISTRO_CERRADO', 'El registro público no está habilitado. Solicite su cuenta al administrador.');
  const email = d.email.trim().toLowerCase();
  const GENERIC = conflict('No fue posible completar el registro con esos datos. Si ya tiene cuenta, ingrese o recupere su contraseña.');
  if (await db.queryOne('SELECT ID FROM USUARIOS WHERE EMAIL = :e', { e: email })) throw GENERIC;
  if (await db.queryOne('SELECT ID FROM EMPRESAS WHERE NIT = :n', { n: d.nit })) throw GENERIC;
  const hash = await hashPassword(d.password);
  const razon = d.tipo === 'PERSONA' ? d.nombre : (d.razon_social || '').trim();
  if (!razon) throw badRequest('Escriba la razón social de la empresa');
  const out = (type = db.oracledb.NUMBER) => ({ dir: db.oracledb.BIND_OUT, type });
  const userId = await db.withTransaction(async (conn) => {
    const emp = await db.execute(
      `INSERT INTO EMPRESAS (NIT, RAZON_SOCIAL, NOMBRE_COMERCIAL, CIUDAD, TELEFONO, EMAIL) VALUES (:nit, :rs, :nc, :ciudad, :tel, :email) RETURNING ID INTO :out_id`,
      { nit: d.nit, rs: razon, nc: razon, ciudad: d.ciudad, tel: d.telefono ?? null, email, out_id: out() }, conn);
    const empId = emp.outBinds.out_id[0];
    const sede = await db.execute(
      `INSERT INTO SEDES (EMPRESA_ID, NOMBRE, CIUDAD) VALUES (:e, 'Sede principal', :c) RETURNING ID INTO :out_id`, { e: empId, c: d.ciudad, out_id: out() }, conn);
    await db.execute(
      `INSERT INTO CONTACTOS (EMPRESA_ID, SEDE_ID, NOMBRE, CARGO, EMAIL, TELEFONO, PRINCIPAL) VALUES (:e, :s, :n, 'Titular de la cuenta', :em, :t, 1)`,
      { e: empId, s: sede.outBinds.out_id[0], n: d.nombre, em: email, t: d.telefono ?? null }, conn);
    const u = await db.execute(
      `INSERT INTO USUARIOS (EMPRESA_ID, EMAIL, NOMBRE, TELEFONO, PASSWORD_HASH, EMAIL_VERIFICADO) VALUES (:e, :em, :n, :t, :h, 0) RETURNING ID INTO :out_id`,
      { e: empId, em: email, n: d.nombre, t: d.telefono ?? null, h: hash, out_id: out() }, conn);
    const uid = u.outBinds.out_id[0];
    await db.execute(`INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID) SELECT :u, ID FROM ROLES WHERE CODIGO = 'CLIENTE'`, { u: uid }, conn);
    await audit({ user: { id: uid }, ip: meta.ip }, 'REGISTRO_PUBLICO', 'USUARIO', uid, { empresa: empId, tipo: d.tipo }, conn);
    return uid;
  });
  await sendActivation({ id: userId, email, nombre: d.nombre }, { invitacion: false });
  return { pendiente: true };
}

/** Genera un enlace de activación (48 h) y lo envía por correo. Un fallo de correo se registra pero no tumba la operación. */
async function sendActivation(user, { invitacion = false, conn = null } = {}) {
  const token = newToken();
  await db.execute('INSERT INTO PASSWORD_RESETS (USUARIO_ID, TOKEN_HASH, EXPIRA_EN) VALUES (:u, :h, :e)', { u: user.id, h: sha256(token), e: new Date(Date.now() + 48 * 3600000) }, conn);
  const link = `${env.appUrl}/activar?token=${token}${invitacion ? '&clave=1' : ''}`;
  try {
    await sendMail({
      to: user.email, subject: 'Active su cuenta - AXORA SOLUTIONS',
      text: `Hola ${user.nombre},\n\n${invitacion ? 'Se creó una cuenta para usted en AXORA SOLUTIONS.' : 'Recibimos su registro en AXORA SOLUTIONS.'} Para autorizar su ingreso abra este enlace (válido por 48 horas)${invitacion ? ' y cree su contraseña' : ''}:\n${link}\n\nSi no fue usted, ignore este mensaje.`,
    });
  } catch (err) {
    console.error('[mail] no se pudo enviar la activación:', err.message);
  }
}

/** Activa el correo con el token; para cuentas por invitación también fija la contraseña. */
async function activate(token, nueva, ctx) {
  await db.withTransaction(async (conn) => {
    const r = await repo.findReset(sha256(token), conn);
    if (!r || r.usado || new Date(r.expira_en) < new Date()) throw badRequest('El enlace de activación no es válido o expiró. Solicite uno nuevo.');
    if (nueva) await repo.setPassword(r.usuario_id, await hashPassword(nueva), conn);
    await repo.setVerified(r.usuario_id, conn);
    await repo.useReset(r.id, conn);
    await audit({ user: { id: r.usuario_id }, ip: ctx.ip }, 'ACTIVAR_CUENTA', 'USUARIO', r.usuario_id, null, conn);
  });
}

/** Reenvío de activación; responde siempre igual, exista o no el correo. */
async function resendActivation(emailRaw) {
  const user = await repo.findUserByEmail(emailRaw.trim().toLowerCase());
  if (user && user.activo && user.email_verificado === 0) await sendActivation(user);
}

/** Renovación con rotación; si se reutiliza un token ya revocado se invalida toda la familia. */
async function refresh(rawToken, meta) {
  if (!rawToken) throw unauthorized('Sin sesión');
  const hash = sha256(rawToken);
  return db.withTransaction(async (conn) => {
    const row = await repo.findRefresh(hash, conn);
    if (!row) throw unauthorized('Sesión inválida');
    if (row.revocado) {
      await repo.revokeFamily(row.familia, conn);
      await audit({ user: { id: row.usuario_id }, ip: meta.ip }, 'REFRESH_REUTILIZADO', 'USUARIO', row.usuario_id, null, conn);
      throw unauthorized('Sesión inválida');
    }
    if (new Date(row.expira_en) < new Date()) throw unauthorized('Sesión expirada');
    const user = await repo.findUserById(row.usuario_id, conn);
    if (!user || !user.activo || (user.empresa_id && !user.empresa_activa)) throw unauthorized('Usuario inactivo');
    await repo.revokeRefresh(row.id, conn);
    return issueSession(user, meta, row.familia, conn);
  });
}

async function logout(rawToken, ctx) {
  if (!rawToken) return;
  const row = await repo.findRefresh(sha256(rawToken));
  if (row) {
    await repo.revokeFamily(row.familia);
    await audit({ user: { id: row.usuario_id }, ip: ctx?.ip }, 'LOGOUT', 'USUARIO', row.usuario_id);
  }
}

async function me(userId) {
  const u = await repo.findUserById(userId);
  if (!u) throw unauthorized();
  return publicUser(u, await repo.loadAccess(userId));
}

async function changePassword(ctx, actual, nueva) {
  const u = await repo.findUserById(ctx.user.id);
  if (!(await bcrypt.compare(actual, u.password_hash))) throw badRequest('La contraseña actual no es correcta');
  await db.withTransaction(async (conn) => {
    await repo.setPassword(u.id, await hashPassword(nueva), conn);
    await repo.revokeAllForUser(u.id, conn);
  });
  await audit(ctx, 'CAMBIO_PASSWORD', 'USUARIO', u.id);
}

/** Siempre responde igual, exista o no el correo (evita enumeración de usuarios). */
async function forgotPassword(email, ctx) {
  const user = await repo.findUserByEmail(email.trim().toLowerCase());
  if (!user || !user.activo) return;
  const token = newToken();
  await repo.saveReset(user.id, sha256(token), new Date(Date.now() + 3600000));
  await audit({ user: { id: user.id }, ip: ctx.ip }, 'SOLICITA_RECUPERACION', 'USUARIO', user.id);
  try {
    await sendMail({
      to: user.email, subject: 'Recuperación de contraseña - MS En Línea',
      text: `Para restablecer su contraseña abra este enlace (válido por 1 hora):\n${env.appUrl}/restablecer?token=${token}\n\nSi no lo solicitó, ignore este mensaje.`,
    });
  } catch (err) {
    console.error('[mail] no se pudo enviar recuperación:', err.message);
  }
}

async function resetPassword(token, nueva, ctx) {
  const hash = sha256(token);
  await db.withTransaction(async (conn) => {
    const r = await repo.findReset(hash, conn);
    if (!r || r.usado || new Date(r.expira_en) < new Date()) throw badRequest('El enlace de recuperación no es válido o expiró');
    await repo.setPassword(r.usuario_id, await hashPassword(nueva), conn);
    await repo.useReset(r.id, conn);
    await repo.revokeAllForUser(r.usuario_id, conn);
    await audit({ user: { id: r.usuario_id }, ip: ctx.ip }, 'RESET_PASSWORD', 'USUARIO', r.usuario_id, null, conn);
  });
}

module.exports = { login, register, sendActivation, activate, resendActivation, refresh, logout, me, changePassword, forgotPassword, resetPassword, hashPassword, sha256, signAccess };
