const express = require('express');
const crypto = require('crypto');
const db = require('../../config/db');
const { badRequest, notFound, conflict, forbidden } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { notifyUsers } = require('../../core/notify');
const { calcularTotales } = require('../../core/totals');
const { computePromoDiscount, isPromoOpen } = require('../../core/promo');
const { requirePerm } = require('../../middleware/auth');
const { parseLocalDate } = require('../../core/dates');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc, email } = require('../../core/schemas');

const normCode = (c) => String(c || '').trim().toUpperCase();
const newIndividualCode = () => `AXO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const LIST_SQL = `
  SELECT P.ID, P.NOMBRE, P.CODIGO, P.DESCRIPCION, P.TIPO_DESCUENTO, P.VALOR_DESCUENTO, P.MAX_BENEFICIARIOS, P.USOS_POR_CLIENTE, P.VALOR_MINIMO,
         P.FECHA_INICIO, P.FECHA_FIN, P.ACTIVA,
         (SELECT COUNT(*) FROM PROMOCION_BENEFICIARIOS B WHERE B.PROMOCION_ID = P.ID) AS BENEFICIARIOS,
         (SELECT COUNT(*) FROM PROMOCION_USOS U WHERE U.PROMOCION_ID = P.ID AND U.ESTADO IN ('RESERVADO','APLICADO')) AS USOS
    FROM PROMOCIONES P`;

async function getPromo(pid, conn) {
  const p = await db.queryOne(`${LIST_SQL} WHERE P.ID = :id`, { id: pid }, conn);
  if (!p) throw notFound('Promoción');
  p.servicio_ids = (await db.query('SELECT SERVICIO_ID FROM PROMOCION_SERVICIOS WHERE PROMOCION_ID = :id', { id: pid }, conn)).map((r) => r.servicio_id);
  return p;
}
async function setServicios(conn, pid, ids) {
  await db.execute('DELETE FROM PROMOCION_SERVICIOS WHERE PROMOCION_ID = :id', { id: pid }, conn);
  for (const s of [...new Set(ids)]) await db.execute('INSERT INTO PROMOCION_SERVICIOS (PROMOCION_ID, SERVICIO_ID) VALUES (:p, :s)', { p: pid, s }, conn);
}

const promoBase = z.object({
  nombre: texto(150), codigo: texto(40).transform(normCode).refine((c) => /^[A-Z0-9_-]{4,40}$/.test(c), 'Use solo letras, números, guion o guion bajo (mín. 4)'),
  descripcion: textoOpc(1000),
  tipo_descuento: z.enum(['PORCENTAJE', 'VALOR']).default('PORCENTAJE'),
  valor_descuento: z.coerce.number().positive(),
  max_beneficiarios: z.coerce.number().int().min(1).max(100000).default(10),
  usos_por_cliente: z.coerce.number().int().min(1).max(100).default(1),
  valor_minimo: z.coerce.number().min(0).default(0),
  fecha_inicio: fecha, fecha_fin: fecha,
  servicio_ids: z.array(id).max(200).optional(),
  activa: z.boolean().optional(),
});
function checkRules(d) {
  if (d.tipo_descuento === 'PORCENTAJE' && d.valor_descuento > 100) throw badRequest('El porcentaje no puede superar 100');
  if (d.fecha_inicio && d.fecha_fin && parseLocalDate(d.fecha_fin) < parseLocalDate(d.fecha_inicio)) throw badRequest('La fecha final no puede ser anterior a la inicial');
}
const COLS = ['nombre', 'codigo', 'descripcion', 'tipo_descuento', 'valor_descuento', 'max_beneficiarios', 'usos_por_cliente', 'valor_minimo'];

// ---------- Administración ----------
const admin = {
  list: () => db.query(`${LIST_SQL} ORDER BY P.CREADO_EN DESC`),
  async get(pid) {
    const p = await getPromo(pid);
    p.beneficiarios = await db.query(
      `SELECT B.ID, B.EMAIL, B.NOMBRE, B.CODIGO_INDIVIDUAL, B.USUARIO_ID, B.CREADO_EN,
              (SELECT COUNT(*) FROM PROMOCION_USOS U WHERE U.BENEFICIARIO_ID = B.ID AND U.ESTADO IN ('RESERVADO','APLICADO')) AS USOS
         FROM PROMOCION_BENEFICIARIOS B WHERE B.PROMOCION_ID = :id ORDER BY B.CREADO_EN`, { id: pid });
    return p;
  },
  async create(ctx, d) {
    checkRules(d);
    if (await db.queryOne('SELECT ID FROM PROMOCIONES WHERE CODIGO = :c', { c: d.codigo })) throw conflict('Ya existe una promoción con ese código');
    const pid = await db.withTransaction(async (conn) => {
      const r = await db.execute(
        `INSERT INTO PROMOCIONES (NOMBRE, CODIGO, DESCRIPCION, TIPO_DESCUENTO, VALOR_DESCUENTO, MAX_BENEFICIARIOS, USOS_POR_CLIENTE, VALOR_MINIMO, FECHA_INICIO, FECHA_FIN, ACTIVA)
         VALUES (:nombre, :codigo, :descripcion, :tipo, :valor, :max, :usos, :min, :ini, :fin, :activa) RETURNING ID INTO :id`,
        { nombre: d.nombre, codigo: d.codigo, descripcion: d.descripcion ?? null, tipo: d.tipo_descuento, valor: d.valor_descuento, max: d.max_beneficiarios,
          usos: d.usos_por_cliente, min: d.valor_minimo, ini: parseLocalDate(d.fecha_inicio), fin: parseLocalDate(d.fecha_fin), activa: d.activa ? 1 : 0,
          id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
      const newId = r.outBinds.id[0];
      await setServicios(conn, newId, d.servicio_ids || []);
      await audit(ctx, 'CREAR', 'PROMOCION', newId, { codigo: d.codigo }, conn);
      return newId;
    });
    return admin.get(pid);
  },
  async update(ctx, pid, d) {
    const cur = await getPromo(pid);
    const merged = { ...cur, ...d, fecha_inicio: d.fecha_inicio ?? cur.fecha_inicio, fecha_fin: d.fecha_fin ?? cur.fecha_fin };
    checkRules({ ...merged, tipo_descuento: merged.tipo_descuento, valor_descuento: Number(merged.valor_descuento) });
    if (d.max_beneficiarios != null && d.max_beneficiarios < Number(cur.beneficiarios)) throw badRequest('El máximo no puede ser menor que los beneficiarios ya autorizados');
    if (d.codigo && d.codigo !== cur.codigo && Number(cur.usos) > 0) throw conflict('No se puede cambiar el código de una promoción que ya fue usada');
    if (d.codigo && d.codigo !== cur.codigo && await db.queryOne('SELECT ID FROM PROMOCIONES WHERE CODIGO = :c', { c: d.codigo })) throw conflict('Ya existe una promoción con ese código');
    await db.withTransaction(async (conn) => {
      const sets = []; const binds = { id: pid };
      for (const c of COLS) if (d[c] !== undefined) { sets.push(`${c.toUpperCase()} = :${c}`); binds[c] = d[c]; }
      if (d.fecha_inicio) { sets.push('FECHA_INICIO = :fi'); binds.fi = parseLocalDate(d.fecha_inicio); }
      if (d.fecha_fin) { sets.push('FECHA_FIN = :ff'); binds.ff = parseLocalDate(d.fecha_fin); }
      if (d.activa !== undefined) { sets.push('ACTIVA = :activa'); binds.activa = d.activa ? 1 : 0; }
      if (sets.length) await db.execute(`UPDATE PROMOCIONES SET ${sets.join(', ')}, ACTUALIZADO_EN = SYSTIMESTAMP WHERE ID = :id`, binds, conn);
      if (d.servicio_ids) await setServicios(conn, pid, d.servicio_ids);
      await audit(ctx, d.activa !== undefined ? (d.activa ? 'ACTIVAR' : 'DESACTIVAR') : 'ACTUALIZAR', 'PROMOCION', pid, null, conn);
    });
    return admin.get(pid);
  },
  /** Autoriza un beneficiario por correo (y, opcionalmente, le genera un código individual). */
  async addBeneficiary(ctx, pid, d) {
    const result = await db.withTransaction(async (conn) => {
      const p = await db.queryOne('SELECT ID, MAX_BENEFICIARIOS FROM PROMOCIONES WHERE ID = :id FOR UPDATE', { id: pid }, conn);
      if (!p) throw notFound('Promoción');
      if (await db.queryOne('SELECT ID FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p AND EMAIL = :e', { p: pid, e: d.email }, conn)) throw conflict('Ese correo ya está autorizado');
      const n = await db.queryOne('SELECT COUNT(*) AS N FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p', { p: pid }, conn);
      if (Number(n.n) >= Number(p.max_beneficiarios)) throw conflict(`Se alcanzó el máximo de ${p.max_beneficiarios} beneficiarios`);
      const user = await db.queryOne('SELECT ID FROM USUARIOS WHERE EMAIL = :e', { e: d.email }, conn);
      const codigo = d.generar_codigo ? newIndividualCode() : null;
      const r = await db.execute(
        `INSERT INTO PROMOCION_BENEFICIARIOS (PROMOCION_ID, EMAIL, NOMBRE, CODIGO_INDIVIDUAL, USUARIO_ID, CREADO_POR)
         VALUES (:p, :e, :n, :c, :u, :cp) RETURNING ID INTO :id`,
        { p: pid, e: d.email, n: d.nombre ?? null, c: codigo, u: user?.id ?? null, cp: ctx.user.id, id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
      await audit(ctx, 'AUTORIZAR_BENEFICIARIO', 'PROMOCION', pid, { email: d.email }, conn);
      return { id: r.outBinds.id[0], email: d.email, codigo_individual: codigo };
    });
    return result;
  },
  async removeBeneficiary(ctx, pid, bid) {
    const b = await db.queryOne('SELECT ID FROM PROMOCION_BENEFICIARIOS WHERE ID = :b AND PROMOCION_ID = :p', { b: bid, p: pid });
    if (!b) throw notFound('Beneficiario');
    const u = await db.queryOne('SELECT COUNT(*) AS N FROM PROMOCION_USOS WHERE BENEFICIARIO_ID = :b', { b: bid });
    if (Number(u.n) > 0) throw conflict('El beneficiario ya tiene usos registrados; no se puede quitar');
    await db.execute('DELETE FROM PROMOCION_BENEFICIARIOS WHERE ID = :b', { b: bid });
    await audit(ctx, 'QUITAR_BENEFICIARIO', 'PROMOCION', pid, { beneficiario: bid });
    return { ok: true };
  },
};

// ---------- Cliente y público ----------
async function myBenefits(user) {
  const rows = await db.query(
    `SELECT P.ID, P.NOMBRE, P.CODIGO, P.DESCRIPCION, P.TIPO_DESCUENTO, P.VALOR_DESCUENTO, P.VALOR_MINIMO, P.USOS_POR_CLIENTE, P.FECHA_INICIO, P.FECHA_FIN, P.ACTIVA, B.ID AS BENEFICIARIO_ID, B.CODIGO_INDIVIDUAL,
            (SELECT COUNT(*) FROM PROMOCION_USOS U WHERE U.BENEFICIARIO_ID = B.ID AND U.ESTADO IN ('RESERVADO','APLICADO')) AS USOS
       FROM PROMOCION_BENEFICIARIOS B JOIN PROMOCIONES P ON P.ID = B.PROMOCION_ID
      WHERE LOWER(B.EMAIL) = :e OR B.USUARIO_ID = :u ORDER BY P.FECHA_FIN DESC`,
    { e: String(user.email || '').toLowerCase(), u: user.id });
  return rows.map((r) => ({ ...r, vigente: isPromoOpen(r), disponible: isPromoOpen(r) && Number(r.usos) < Number(r.usos_por_cliente) }));
}
/** Información pública: solo si hay una promoción activa y vigente; nunca expone beneficiarios ni cupos. */
async function publicPromo() {
  const rows = await db.query(`SELECT NOMBRE, DESCRIPCION, TIPO_DESCUENTO, VALOR_DESCUENTO, FECHA_INICIO, FECHA_FIN, ACTIVA FROM PROMOCIONES WHERE ACTIVA = 1 ORDER BY CREADO_EN DESC`);
  const p = rows.find((r) => isPromoOpen(r));
  return p ? { nombre: p.nombre, descripcion: p.descripcion, tipo_descuento: p.tipo_descuento, valor_descuento: p.valor_descuento, fecha_fin: p.fecha_fin } : null;
}

// ---------- Aplicación a una cotización ----------
async function loadQuote(user, cid, conn) {
  const c = await db.queryOne('SELECT * FROM COTIZACIONES WHERE ID = :id', { id: cid }, conn);
  if (!c || (user.isClient && (c.empresa_id !== user.empresaId || c.estado === 'BORRADOR'))) throw notFound('Cotización');
  if (!user.isClient && !user.isStaff) throw forbidden();
  return c;
}
async function recompute(conn, cid, c, descuento) {
  const items = await db.query('SELECT SERVICIO_ID, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO FROM DETALLE_COTIZACION WHERE COTIZACION_ID = :id', { id: cid }, conn);
  return calcularTotales(items, Number(c.iva_porcentaje), descuento);
}

/**
 * Aplica una promoción a una cotización. TODA la validación ocurre aquí (backend), dentro de una transacción
 * que bloquea la fila de la promoción para que dos solicitudes simultáneas no superen los usos permitidos.
 */
async function applyToQuote(ctx, cid, codigoRaw) {
  const codigo = normCode(codigoRaw);
  if (!codigo) throw badRequest('Ingrese un código promocional');
  const { user } = ctx;
  const out = await db.withTransaction(async (conn) => {
    const c = await loadQuote(user, cid, conn);
    if (!['BORRADOR', 'ENVIADA'].includes(c.estado)) throw badRequest('Solo se puede aplicar una promoción a cotizaciones en borrador o enviadas');
    if (user.isClient && c.estado !== 'ENVIADA') throw badRequest('La cotización aún no está disponible');
    if (c.promocion_id) throw conflict('Esta cotización ya tiene una promoción aplicada');
    if (Number(c.descuento) > 0) throw conflict('La cotización ya tiene un descuento manual; quítelo antes de aplicar una promoción');

    // Persona beneficiaria: el cliente que responde, o el solicitante de la cotización cuando la aplica el personal.
    let actor = { id: user.id, email: user.email };
    if (!user.isClient) {
      const sol = c.solicitud_id ? await db.queryOne('SELECT U.ID, U.EMAIL FROM SOLICITUDES S JOIN USUARIOS U ON U.ID = S.SOLICITANTE_ID WHERE S.ID = :s', { s: c.solicitud_id }, conn) : null;
      if (!sol) throw badRequest('La cotización no tiene un solicitante asociado para validar el beneficio');
      actor = { id: sol.id, email: sol.email };
    }
    const actorEmail = String(actor.email || '').toLowerCase();

    // Resolver promoción: código general o código individual del beneficiario. Mensaje genérico para no permitir sondeo de códigos.
    const INVALID = badRequest('Código promocional no válido o no autorizado para este usuario');
    let promo = await db.queryOne('SELECT ID FROM PROMOCIONES WHERE CODIGO = :c', { c: codigo }, conn);
    let benef = null;
    if (promo) {
      benef = await db.queryOne('SELECT * FROM PROMOCION_BENEFICIARIOS WHERE PROMOCION_ID = :p AND LOWER(EMAIL) = :e', { p: promo.id, e: actorEmail }, conn);
    } else {
      benef = await db.queryOne('SELECT * FROM PROMOCION_BENEFICIARIOS WHERE CODIGO_INDIVIDUAL = :c', { c: codigo }, conn);
      if (benef && benef.usuario_id && benef.usuario_id !== actor.id) benef = null; // código ya reclamado por otra persona
      if (benef) promo = { id: benef.promocion_id };
    }
    if (!promo || !benef) throw INVALID;

    const p = await db.queryOne('SELECT * FROM PROMOCIONES WHERE ID = :id FOR UPDATE', { id: promo.id }, conn);
    if (!p || !isPromoOpen(p)) throw badRequest('La promoción no está activa o está fuera de su vigencia');
    const used = await db.queryOne("SELECT COUNT(*) AS N FROM PROMOCION_USOS WHERE PROMOCION_ID = :p AND BENEFICIARIO_ID = :b AND ESTADO IN ('RESERVADO','APLICADO')", { p: p.id, b: benef.id }, conn);
    if (Number(used.n) >= Number(p.usos_por_cliente)) throw conflict('Ya se alcanzó el número de usos permitidos de esta promoción');

    const serviceIds = (await db.query('SELECT SERVICIO_ID FROM PROMOCION_SERVICIOS WHERE PROMOCION_ID = :p', { p: p.id }, conn)).map((r) => r.servicio_id);
    const items = await db.query('SELECT SERVICIO_ID, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO FROM DETALLE_COTIZACION WHERE COTIZACION_ID = :id', { id: cid }, conn);
    const lineas = items.map((i) => ({ ...i, total_linea: Number(i.cantidad) * Number(i.precio_unitario) }));
    const { descuento } = computePromoDiscount(p, lineas, serviceIds);
    const t = calcularTotales(items, Number(c.iva_porcentaje), descuento);

    await db.execute(
      `UPDATE COTIZACIONES SET DESCUENTO = :d, IVA_VALOR = :iva, TOTAL = :t, PROMOCION_ID = :p, ACTUALIZADO_EN = SYSTIMESTAMP WHERE ID = :id`,
      { d: t.descuento, iva: t.iva_valor, t: t.total, p: p.id, id: cid }, conn);
    await db.execute('INSERT INTO PROMOCION_USOS (PROMOCION_ID, BENEFICIARIO_ID, COTIZACION_ID, VALOR_DESCUENTO) VALUES (:p, :b, :c, :v)', { p: p.id, b: benef.id, c: cid, v: t.descuento }, conn);
    if (!benef.usuario_id) await db.execute('UPDATE PROMOCION_BENEFICIARIOS SET USUARIO_ID = :u WHERE ID = :b', { u: actor.id, b: benef.id }, conn);
    await audit(ctx, 'APLICAR_PROMOCION', 'COTIZACION', cid, { promocion: p.codigo, descuento: t.descuento }, conn);
    if (!user.isClient) await notifyUsers(conn, [actor.id], { tipo: 'PROMOCION_APLICADA', titulo: 'Se aplicó su beneficio a una cotización', mensaje: `${p.nombre}: descuento de ${t.descuento}.`, enlace: `/cotizaciones/${cid}`, empresaId: c.empresa_id });
    return { cotizacion_id: cid, promocion: p.nombre, codigo: p.codigo, subtotal: t.subtotal, descuento: t.descuento, iva_valor: t.iva_valor, total: t.total };
  });
  return out;
}

/** Quita la promoción de una cotización (solo personal, mientras esté en borrador) y libera el uso. */
async function removeFromQuote(ctx, cid) {
  if (!ctx.user.isStaff) throw forbidden();
  return db.withTransaction(async (conn) => {
    const c = await loadQuote(ctx.user, cid, conn);
    if (!c.promocion_id) throw badRequest('La cotización no tiene promoción aplicada');
    if (c.estado !== 'BORRADOR') throw badRequest('Solo se puede quitar la promoción de una cotización en borrador');
    const t = await recompute(conn, cid, c, 0);
    await db.execute('UPDATE COTIZACIONES SET DESCUENTO = 0, IVA_VALOR = :iva, TOTAL = :t, PROMOCION_ID = NULL WHERE ID = :id', { iva: t.iva_valor, t: t.total, id: cid }, conn);
    await db.execute("UPDATE PROMOCION_USOS SET ESTADO = 'LIBERADO', ACTUALIZADO_EN = SYSTIMESTAMP WHERE COTIZACION_ID = :c AND ESTADO = 'RESERVADO'", { c: cid }, conn);
    await audit(ctx, 'QUITAR_PROMOCION', 'COTIZACION', cid, null, conn);
    return { cotizacion_id: cid, subtotal: t.subtotal, descuento: 0, total: t.total };
  });
}

/** Ciclo de vida del uso según el desenlace de la cotización: aprobada → aplicado; rechazada/anulada/vencida → liberado. */
async function settleUsage(conn, cid, outcome) {
  const estado = outcome === 'APROBADA' ? 'APLICADO' : 'LIBERADO';
  await db.execute("UPDATE PROMOCION_USOS SET ESTADO = :e, ACTUALIZADO_EN = SYSTIMESTAMP WHERE COTIZACION_ID = :c AND ESTADO = 'RESERVADO'", { e: estado, c: cid }, conn);
}

const router = express.Router();
router.get('/mis-beneficios', requirePerm('solicitudes:create'), asyncHandler(async (req, res) => res.json(await myBenefits(req.user))));
router.get('/', requirePerm('promociones:read'), asyncHandler(async (req, res) => res.json(await admin.list())));
router.get('/:id(\\d+)', requirePerm('promociones:read'), asyncHandler(async (req, res) => res.json(await admin.get(Number(req.params.id)))));
router.post('/', requirePerm('promociones:write'), validate(promoBase), asyncHandler(async (req, res) => res.status(201).json(await admin.create(ctxOf(req), req.valid))));
router.put('/:id(\\d+)', requirePerm('promociones:write'), validate(promoBase.partial()), asyncHandler(async (req, res) => res.json(await admin.update(ctxOf(req), Number(req.params.id), req.valid))));
const benefSchema = z.object({ email, nombre: textoOpc(150), generar_codigo: z.boolean().optional() });
router.post('/:id(\\d+)/beneficiarios', requirePerm('promociones:write'), validate(benefSchema), asyncHandler(async (req, res) => res.status(201).json(await admin.addBeneficiary(ctxOf(req), Number(req.params.id), req.valid))));
router.delete('/:id(\\d+)/beneficiarios/:bid(\\d+)', requirePerm('promociones:write'), asyncHandler(async (req, res) => res.json(await admin.removeBeneficiary(ctxOf(req), Number(req.params.id), Number(req.params.bid)))));

const publicRouter = express.Router();
publicRouter.get('/promocion', asyncHandler(async (req, res) => res.json({ promocion: await publicPromo() })));
publicRouter.get('/servicios', asyncHandler(async (req, res) => res.json(await db.query(
  'SELECT LINEA, CODIGO, NOMBRE, DESCRIPCION, UNIDAD FROM SERVICIOS WHERE ACTIVO = 1 ORDER BY LINEA, NOMBRE'))));

module.exports = { router, publicRouter, applyToQuote, removeFromQuote, settleUsage, admin, myBenefits, promoBase };
