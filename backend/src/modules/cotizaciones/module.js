const express = require('express');
const env = require('../../config/env');
const { buildQuotePdf, money } = require('../../core/quote-pdf');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { badRequest, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { recordState } = require('../../core/history');
const { notifyStaff, notifyCompany } = require('../../core/notify');
const { COTIZACION, assertTransition } = require('../../core/states');
const { calcularTotales } = require('../../core/totals');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');
const solicitudes = require('../solicitudes/module');
const promos = require('../promociones/module');

const repo = createRepository({
  table: 'COTIZACIONES', alias: 'C',
  columns: ['empresa_id', 'solicitud_id', 'creado_por', 'estado', 'fecha_emision', 'validez_hasta', 'subtotal', 'descuento', 'iva_porcentaje', 'iva_valor', 'total', 'notas', 'motivo_rechazo', 'respondido_por', 'promocion_id', 'fecha_respuesta'],
  readOnlyColumns: ['codigo'], dateColumns: ['fecha_emision', 'validez_hasta', 'fecha_respuesta'],
  searchable: ['codigo', 'notas'], filters: ['empresa_id', 'solicitud_id', 'estado'], notFilters: ['estado'], dateRangeColumn: 'fecha_emision',
  joins: 'JOIN EMPRESAS E ON E.ID = C.EMPRESA_ID LEFT JOIN SOLICITUDES S ON S.ID = C.SOLICITUD_ID',
  selectExtra: 'E.RAZON_SOCIAL AS EMPRESA_NOMBRE, S.CODIGO AS SOLICITUD_CODIGO, (SELECT PR.NOMBRE FROM PROMOCIONES PR WHERE PR.ID = C.PROMOCION_ID) AS PROMOCION_NOMBRE, (SELECT PR.CODIGO FROM PROMOCIONES PR WHERE PR.ID = C.PROMOCION_ID) AS PROMOCION_CODIGO', empresaColumn: 'empresa_id',
});

const link = (cid) => `/cotizaciones/${cid}`;

async function mustGet(user, cid, conn) {
  const c = await repo.findById(cid, repo.scopeFor(user), conn);
  // El cliente nunca ve borradores
  if (!c || (user.isClient && c.estado === 'BORRADOR')) throw notFound('Cotización');
  return c;
}

async function writeLines(conn, cid, lineas) {
  await db.execute('DELETE FROM DETALLE_COTIZACION WHERE COTIZACION_ID = :id', { id: cid }, conn);
  for (const l of lineas) {
    await db.execute(
      'INSERT INTO DETALLE_COTIZACION (COTIZACION_ID, SERVICIO_ID, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, TOTAL_LINEA) VALUES (:c, :s, :d, :q, :p, :t)',
      { c: cid, s: l.servicio_id ?? null, d: l.descripcion, q: l.cantidad, p: l.precio_unitario, t: l.total_linea }, conn);
  }
}

const service = {
  list(user, query) {
    const q = { ...query };
    if (user.isClient) q.not_estado = 'BORRADOR';
    return repo.list(q, repo.scopeFor(user));
  },
  async get(user, cid) {
    const c = await mustGet(user, cid);
    c.items = await db.query('SELECT ID, SERVICIO_ID, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, TOTAL_LINEA FROM DETALLE_COTIZACION WHERE COTIZACION_ID = :id ORDER BY ID', { id: cid });
    return c;
  },
  async create(ctx, d) {
    let empresaId = d.empresa_id;
    if (d.solicitud_id) {
      const s = await db.queryOne('SELECT EMPRESA_ID, ESTADO FROM SOLICITUDES WHERE ID = :id', { id: d.solicitud_id });
      if (!s) throw notFound('Solicitud');
      if (['CERRADA', 'CANCELADA'].includes(s.estado)) throw badRequest('La solicitud ya está finalizada');
      if (empresaId && empresaId !== s.empresa_id) throw badRequest('La solicitud pertenece a otra empresa');
      empresaId = s.empresa_id;
    }
    if (!empresaId) throw badRequest('Indique la empresa o la solicitud');
    const t = calcularTotales(d.items, d.iva_porcentaje, d.descuento);
    const cid = await db.withTransaction(async (conn) => {
      const newId = await repo.create({
        empresa_id: empresaId, solicitud_id: d.solicitud_id, creado_por: ctx.user.id, estado: 'BORRADOR', validez_hasta: d.validez_hasta,
        subtotal: t.subtotal, descuento: t.descuento, iva_porcentaje: t.iva_porcentaje, iva_valor: t.iva_valor, total: t.total, notas: d.notas,
      }, conn);
      await writeLines(conn, newId, t.lineas);
      await recordState(conn, { entidad: 'COTIZACION', entidadId: newId, nuevo: 'BORRADOR', usuarioId: ctx.user.id, empresaId });
      await audit(ctx, 'CREAR', 'COTIZACION', newId, { total: t.total }, conn);
      return newId;
    });
    return service.get(ctx.user, cid);
  },
  async update(ctx, cid, d) {
    const c = await mustGet(ctx.user, cid);
    if (c.estado !== 'BORRADOR') throw badRequest('Solo se pueden editar cotizaciones en borrador');
    if (c.promocion_id && (d.items || d.descuento !== undefined || d.iva_porcentaje !== undefined)) throw badRequest('Quite la promoción aplicada antes de modificar los conceptos o el descuento');
    await db.withTransaction(async (conn) => {
      const patch = { validez_hasta: d.validez_hasta, notas: d.notas };
      if (d.items) {
        const t = calcularTotales(d.items, d.iva_porcentaje ?? c.iva_porcentaje, d.descuento ?? c.descuento);
        Object.assign(patch, { subtotal: t.subtotal, descuento: t.descuento, iva_porcentaje: t.iva_porcentaje, iva_valor: t.iva_valor, total: t.total });
        await writeLines(conn, cid, t.lineas);
      }
      await repo.update(cid, patch, {}, conn);
      await audit(ctx, 'ACTUALIZAR', 'COTIZACION', cid, null, conn);
    });
    return service.get(ctx.user, cid);
  },
  async send(ctx, cid) {
    const c = await mustGet(ctx.user, cid);
    assertTransition(COTIZACION, c.estado, 'ENVIADA', 'cotización');
    await db.withTransaction(async (conn) => {
      await repo.update(cid, { estado: 'ENVIADA', fecha_emision: new Date() }, {}, conn);
      await recordState(conn, { entidad: 'COTIZACION', entidadId: cid, anterior: c.estado, nuevo: 'ENVIADA', usuarioId: ctx.user.id, empresaId: c.empresa_id });
      if (c.solicitud_id) {
        const s = await solicitudes.service.mustGet(ctx.user, c.solicitud_id, conn);
        if (['NUEVA', 'EN_REVISION'].includes(s.estado)) await solicitudes.transition(conn, ctx.user, s, 'COTIZADA', `Cotización ${c.codigo} enviada`);
      }
      await notifyCompany(conn, c.empresa_id, { tipo: 'COTIZACION_ENVIADA', titulo: `Nueva cotización ${c.codigo}`, mensaje: `Total ${money(c.total)}. Requiere su respuesta.`, enlace: link(cid) });
      await audit(ctx, 'ENVIAR', 'COTIZACION', cid, null, conn);
    });
    return service.get(ctx.user, cid);
  },
  async annul(ctx, cid) {
    const c = await mustGet(ctx.user, cid);
    assertTransition(COTIZACION, c.estado, 'ANULADA', 'cotización');
    await db.withTransaction(async (conn) => {
      await repo.update(cid, { estado: 'ANULADA' }, {}, conn);
      await promos.settleUsage(conn, cid, 'ANULADA');
      await recordState(conn, { entidad: 'COTIZACION', entidadId: cid, anterior: c.estado, nuevo: 'ANULADA', usuarioId: ctx.user.id, empresaId: c.empresa_id });
      await audit(ctx, 'ANULAR', 'COTIZACION', cid, null, conn);
    });
    return service.get(ctx.user, cid);
  },
  /** «Solo consultar»: el cliente hace una pregunta sobre la cotización sin aprobarla ni rechazarla; la cotización sigue ENVIADA. */
  async consult(ctx, cid, mensaje) {
    const c = await mustGet(ctx.user, cid);
    if (c.estado !== 'ENVIADA') throw badRequest('Solo se puede consultar una cotización enviada');
    await db.withTransaction(async (conn) => {
      await recordState(conn, { entidad: 'COTIZACION', entidadId: cid, anterior: c.estado, nuevo: c.estado, comentario: `Consulta del cliente: ${mensaje}`, usuarioId: ctx.user.id, empresaId: c.empresa_id });
      await notifyStaff(conn, { tipo: 'COTIZACION_CONSULTA', titulo: `Consulta sobre la cotización ${c.codigo}`, mensaje, enlace: link(cid), empresaId: c.empresa_id });
      await audit(ctx, 'CONSULTAR', 'COTIZACION', cid, null, conn);
    });
    return { ok: true };
  },
  /** Aprobación/rechazo: el cliente solo puede responder cotizaciones de SU empresa (scope por identidad). */
  async respond(ctx, cid, aprobada, motivo) {
    const c = await mustGet(ctx.user, cid);
    if (c.estado === 'ENVIADA' && c.validez_hasta && new Date(c.validez_hasta) < new Date(new Date().toDateString())) {
      await db.withTransaction(async (conn) => {
        await db.execute("UPDATE COTIZACIONES SET ESTADO = 'VENCIDA' WHERE ID = :id", { id: cid }, conn);
        await promos.settleUsage(conn, cid, 'VENCIDA');
      });
      throw badRequest('La cotización está vencida');
    }
    const nuevo = aprobada ? 'APROBADA' : 'RECHAZADA';
    assertTransition(COTIZACION, c.estado, nuevo, 'cotización');
    if (!aprobada && !motivo) throw badRequest('Indique el motivo del rechazo');
    await db.withTransaction(async (conn) => {
      await repo.update(cid, { estado: nuevo, respondido_por: ctx.user.id, fecha_respuesta: new Date(), motivo_rechazo: aprobada ? null : motivo }, {}, conn);
      await promos.settleUsage(conn, cid, nuevo);
      await recordState(conn, { entidad: 'COTIZACION', entidadId: cid, anterior: c.estado, nuevo, comentario: motivo, usuarioId: ctx.user.id, empresaId: c.empresa_id });
      if (c.solicitud_id) {
        const s = await db.queryOne('SELECT * FROM SOLICITUDES WHERE ID = :id', { id: c.solicitud_id }, conn);
        if (s) {
          const target = aprobada ? 'AUTORIZADA' : 'EN_REVISION';
          const sol = { ...s, id: s.id };
          if (s.estado !== target) await solicitudes.transition(conn, ctx.user, sol, target, aprobada ? `Cotización ${c.codigo} aprobada` : `Cotización ${c.codigo} rechazada`);
        }
      }
      await notifyStaff(conn, { tipo: 'COTIZACION_RESPUESTA', titulo: `Cotización ${c.codigo} ${aprobada ? 'aprobada' : 'rechazada'}`, mensaje: motivo || null, enlace: link(cid), empresaId: c.empresa_id });
      await audit(ctx, aprobada ? 'APROBAR' : 'RECHAZAR', 'COTIZACION', cid, { motivo }, conn);
    });
    return service.get(ctx.user, cid);
  },
  /**
   * Genera el PDF de una cotización con datos reales de Oracle.
   * service.get() ya aplica el aislamiento por empresa y oculta borradores a los clientes.
   * El PDF se arma completo en memoria antes de responder: si algo falla, se devuelve un error JSON y no un PDF a medias.
   */
  async pdf(user, cid, res) {
    const c = await service.get(user, cid);
    const emp = await db.queryOne('SELECT RAZON_SOCIAL, NIT, DIRECCION, CIUDAD, TELEFONO, EMAIL FROM EMPRESAS WHERE ID = :id', { id: c.empresa_id });
    // Contacto = quien registró la solicitud asociada; si no hay solicitud, no se imprime contacto (no se inventa)
    const contacto = c.solicitud_id
      ? await db.queryOne('SELECT U.NOMBRE FROM SOLICITUDES S JOIN USUARIOS U ON U.ID = S.SOLICITANTE_ID WHERE S.ID = :id', { id: c.solicitud_id })
      : null;
    const units = await db.query('SELECT D.ID, S.UNIDAD FROM DETALLE_COTIZACION D LEFT JOIN SERVICIOS S ON S.ID = D.SERVICIO_ID WHERE D.COTIZACION_ID = :id', { id: cid });
    const unitById = new Map(units.map((u) => [u.id, u.unidad]));
    const items = c.items.map((it) => ({ ...it, unidad: unitById.get(it.id) || 'servicio' }));
    const pdf = buildQuotePdf({
      quotation: { ...c, items },
      client: { razon_social: emp.razon_social, nit: emp.nit, direccion: emp.direccion, ciudad: emp.ciudad, telefono: emp.telefono, email: emp.email, contacto: contacto?.nombre || null },
      issuer: env.company,
    });
    const chunks = [];
    for await (const chunk of pdf) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${c.codigo}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buffer);
  },
};

const itemSchema = z.object({ servicio_id: id.nullish(), descripcion: texto(300), cantidad: z.coerce.number().positive().max(100000), precio_unitario: z.coerce.number().min(0).max(1e10) });
const createSchema = z.object({
  empresa_id: id.optional(), solicitud_id: id.nullish(), validez_hasta: fecha.nullish().or(z.literal('')), iva_porcentaje: z.coerce.number().min(0).max(100).default(19),
  descuento: z.coerce.number().min(0).default(0), notas: textoOpc(2000), items: z.array(itemSchema).min(1).max(100),
});
const updateSchema = createSchema.partial().omit({ empresa_id: true, solicitud_id: true });

const router = express.Router();
router.get('/', requirePerm('cotizaciones:read'), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
router.get('/:id', requirePerm('cotizaciones:read'), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
router.get('/:id/pdf', requirePerm('cotizaciones:read'), asyncHandler(async (req, res) => service.pdf(req.user, Number(req.params.id), res)));
router.post('/', requirePerm('cotizaciones:write'), validate(createSchema), asyncHandler(async (req, res) => res.status(201).json(await service.create(ctxOf(req), req.valid))));
router.put('/:id', requirePerm('cotizaciones:write'), validate(updateSchema), asyncHandler(async (req, res) => res.json(await service.update(ctxOf(req), Number(req.params.id), req.valid))));
router.post('/:id/enviar', requirePerm('cotizaciones:write'), asyncHandler(async (req, res) => res.json(await service.send(ctxOf(req), Number(req.params.id)))));
router.post('/:id/anular', requirePerm('cotizaciones:write'), asyncHandler(async (req, res) => res.json(await service.annul(ctxOf(req), Number(req.params.id)))));
router.post('/:id/respuesta', requirePerm('cotizaciones:respond'), validate(z.object({ aprobada: z.boolean(), motivo: textoOpc(1000) })),
  asyncHandler(async (req, res) => res.json(await service.respond(ctxOf(req), Number(req.params.id), req.valid.aprobada, req.valid.motivo))));

router.post('/:id/consulta', requirePerm('cotizaciones:respond'), validate(z.object({ mensaje: texto(1000, 3) })),
  asyncHandler(async (req, res) => res.json(await service.consult(ctxOf(req), Number(req.params.id), req.valid.mensaje))));

router.post('/:id/promocion', requirePerm('cotizaciones:respond', 'cotizaciones:write'), validate(z.object({ codigo: texto(40) })),
  asyncHandler(async (req, res) => res.json(await promos.applyToQuote(ctxOf(req), Number(req.params.id), req.valid.codigo))));
router.delete('/:id/promocion', requirePerm('cotizaciones:write'), asyncHandler(async (req, res) => res.json(await promos.removeFromQuote(ctxOf(req), Number(req.params.id)))));

module.exports = { router, service, repo };
