const express = require('express');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { badRequest, forbidden, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { recordState } = require('../../core/history');
const { notifyStaff, notifyUsers, notifyCompany } = require('../../core/notify');
const { ORDEN, assertTransition } = require('../../core/states');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');
const solicitudes = require('../solicitudes/module');

const repo = createRepository({
  table: 'ORDENES_SERVICIO', alias: 'O',
  columns: ['empresa_id', 'sede_id', 'solicitud_id', 'cotizacion_id', 'equipo_id', 'servicio_id', 'tecnico_id', 'creado_por', 'estado', 'prioridad', 'descripcion_trabajo', 'diagnostico', 'solucion', 'fecha_programada', 'fecha_inicio', 'fecha_fin', 'fecha_cierre'],
  readOnlyColumns: ['codigo'], dateColumns: ['fecha_programada', 'fecha_inicio', 'fecha_fin', 'fecha_cierre'],
  searchable: ['codigo', 'descripcion_trabajo'], filters: ['empresa_id', 'tecnico_id', 'estado', 'prioridad', 'solicitud_id', 'equipo_id'],
  joins: `JOIN EMPRESAS E ON E.ID = O.EMPRESA_ID LEFT JOIN SEDES SD ON SD.ID = O.SEDE_ID LEFT JOIN EQUIPOS Q ON Q.ID = O.EQUIPO_ID
          LEFT JOIN SOLICITUDES S ON S.ID = O.SOLICITUD_ID LEFT JOIN USUARIOS TU ON TU.ID = O.TECNICO_ID`,
  selectExtra: `E.RAZON_SOCIAL AS EMPRESA_NOMBRE, SD.NOMBRE AS SEDE_NOMBRE, SD.DIRECCION AS SEDE_DIRECCION, Q.NOMBRE AS EQUIPO_NOMBRE, Q.TIPO AS EQUIPO_TIPO,
                Q.MARCA AS EQUIPO_MARCA, Q.MODELO AS EQUIPO_MODELO, Q.SERIAL AS EQUIPO_SERIAL, S.CODIGO AS SOLICITUD_CODIGO, S.ASUNTO AS SOLICITUD_ASUNTO, TU.NOMBRE AS TECNICO_NOMBRE`,
  empresaColumn: 'empresa_id', tecnicoColumn: 'tecnico_id', dateRangeColumn: 'creado_en',
});

const link = (oid) => `/ordenes/${oid}`;

async function mustGet(user, oid, conn) {
  const o = await repo.findById(oid, repo.scopeFor(user), conn); // técnico: solo las suyas; cliente: solo su empresa
  if (!o) throw notFound('Orden de servicio');
  return o;
}

async function changeState(conn, user, o, nuevo, extra = {}, comentario) {
  assertTransition(ORDEN, o.estado, nuevo, 'orden');
  await repo.update(o.id, { estado: nuevo, ...extra }, {}, conn);
  await recordState(conn, { entidad: 'ORDEN', entidadId: o.id, anterior: o.estado, nuevo, comentario, usuarioId: user.id, empresaId: o.empresa_id, equipoId: o.equipo_id });
}

/** El técnico solo opera sobre órdenes asignadas a él; el personal administrativo puede operar cualquiera. */
function assertCanExecute(user, o) {
  if (user.isStaff) return;
  if (!user.permisos.has('ordenes:execute') || o.tecnico_id !== user.id) throw forbidden('Esta orden no está asignada a usted');
}

const service = {
  list: (user, query) => repo.list(query, repo.scopeFor(user)),

  async get(user, oid) {
    const o = await mustGet(user, oid);
    const items = await db.query('SELECT D.ID, D.TIPO, D.DESCRIPCION, D.CANTIDAD, D.COSTO_UNITARIO, D.FECHA, U.NOMBRE AS REGISTRADO_POR_NOMBRE FROM DETALLE_ORDEN D JOIN USUARIOS U ON U.ID = D.REGISTRADO_POR WHERE D.ORDEN_ID = :id ORDER BY D.ID', { id: oid });
    // el cliente ve actividades y materiales, pero no los costos internos
    o.detalle = user.isClient ? items.map(({ costo_unitario, ...rest }) => rest) : items;
    o.adjuntos = await db.query(`SELECT ID, TIPO, NOMBRE_ORIGINAL, MIME, TAMANO, CREADO_EN FROM ADJUNTOS WHERE ENTIDAD = 'ORDEN' AND ENTIDAD_ID = :id AND ACTIVO = 1 ORDER BY ID`, { id: oid });
    o.historial = await db.query(
      `SELECT H.ID, H.ESTADO_ANTERIOR, H.ESTADO_NUEVO, H.COMENTARIO, H.FECHA, U.NOMBRE AS USUARIO_NOMBRE FROM HISTORIAL_ESTADOS H LEFT JOIN USUARIOS U ON U.ID = H.USUARIO_ID
        WHERE H.ENTIDAD = 'ORDEN' AND H.ENTIDAD_ID = :id ORDER BY H.FECHA, H.ID`, { id: oid });
    return o;
  },

  /** Conversión de una solicitud AUTORIZADA en orden de servicio. */
  async createFromSolicitud(ctx, d) {
    const s = await solicitudes.service.mustGet(ctx.user, d.solicitud_id);
    if (s.estado !== 'AUTORIZADA') throw badRequest('Solo se pueden generar órdenes de solicitudes AUTORIZADAS');
    const dup = await db.queryOne(`SELECT COUNT(*) AS N FROM ORDENES_SERVICIO WHERE SOLICITUD_ID = :id AND ESTADO <> 'CANCELADA'`, { id: s.id });
    if (dup.n > 0) throw badRequest('La solicitud ya tiene una orden de servicio activa');
    const cot = await db.queryOne(`SELECT ID FROM COTIZACIONES WHERE SOLICITUD_ID = :id AND ESTADO = 'APROBADA' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`, { id: s.id });
    const tecnicoId = d.tecnico_id || s.tecnico_id || null;
    if (tecnicoId) await solicitudes.assertTecnico(tecnicoId);
    const oid = await db.withTransaction(async (conn) => {
      const newId = await repo.create({
        empresa_id: s.empresa_id, sede_id: s.sede_id, solicitud_id: s.id, cotizacion_id: cot?.id ?? null, equipo_id: s.equipo_id, servicio_id: s.servicio_id,
        tecnico_id: tecnicoId, creado_por: ctx.user.id, estado: tecnicoId ? 'ASIGNADA' : 'PENDIENTE', prioridad: s.prioridad,
        descripcion_trabajo: d.descripcion_trabajo || s.descripcion, fecha_programada: d.fecha_programada || s.fecha_programada,
      }, conn);
      await recordState(conn, { entidad: 'ORDEN', entidadId: newId, nuevo: tecnicoId ? 'ASIGNADA' : 'PENDIENTE', comentario: `Generada desde ${s.codigo}`, usuarioId: ctx.user.id, empresaId: s.empresa_id, equipoId: s.equipo_id });
      if (tecnicoId) {
        await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('ORDEN', :id, :t, :u)`, { id: newId, t: tecnicoId, u: ctx.user.id }, conn);
        await notifyUsers(conn, [tecnicoId], { tipo: 'ORDEN_ASIGNADA', titulo: 'Se le asignó una orden de servicio', mensaje: s.asunto, enlace: link(newId), empresaId: s.empresa_id });
      }
      await audit(ctx, 'CREAR', 'ORDEN', newId, { solicitud: s.id }, conn);
      return newId;
    });
    return service.get(ctx.user, oid);
  },

  async assign(ctx, oid, tecnicoId) {
    const o = await mustGet(ctx.user, oid);
    if (!['PENDIENTE', 'ASIGNADA'].includes(o.estado)) throw badRequest('Solo se puede asignar una orden pendiente o asignada');
    await solicitudes.assertTecnico(tecnicoId);
    await db.withTransaction(async (conn) => {
      await changeState(conn, ctx.user, o, 'ASIGNADA', { tecnico_id: tecnicoId }, 'Técnico asignado');
      await db.execute(`UPDATE ASIGNACIONES SET ACTIVA = 0 WHERE ENTIDAD = 'ORDEN' AND ENTIDAD_ID = :id`, { id: oid }, conn);
      await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('ORDEN', :id, :t, :u)`, { id: oid, t: tecnicoId, u: ctx.user.id }, conn);
      await notifyUsers(conn, [tecnicoId], { tipo: 'ORDEN_ASIGNADA', titulo: `Se le asignó la orden ${o.codigo}`, mensaje: o.solicitud_asunto, enlace: link(oid), empresaId: o.empresa_id });
      await audit(ctx, 'ASIGNAR', 'ORDEN', oid, { tecnicoId }, conn);
    });
    return service.get(ctx.user, oid);
  },

  async start(ctx, oid) {
    const o = await mustGet(ctx.user, oid);
    assertCanExecute(ctx.user, o);
    if (!o.tecnico_id) throw badRequest('La orden no tiene técnico asignado');
    await db.withTransaction(async (conn) => {
      await changeState(conn, ctx.user, o, 'EN_EJECUCION', { fecha_inicio: new Date() }, 'Servicio iniciado');
      if (o.solicitud_id) {
        const s = await db.queryOne('SELECT * FROM SOLICITUDES WHERE ID = :id', { id: o.solicitud_id }, conn);
        if (s && s.estado === 'AUTORIZADA') await solicitudes.transition(conn, ctx.user, s, 'EN_PROCESO', `Orden ${o.codigo} iniciada`);
      }
      await notifyCompany(conn, o.empresa_id, { tipo: 'ORDEN_INICIADA', titulo: `El técnico inició el servicio ${o.codigo}`, enlace: link(oid) });
      await audit(ctx, 'INICIAR', 'ORDEN', oid, null, conn);
    });
    return service.get(ctx.user, oid);
  },

  async diagnose(ctx, oid, d) {
    const o = await mustGet(ctx.user, oid);
    assertCanExecute(ctx.user, o);
    if (o.estado !== 'EN_EJECUCION') throw badRequest('La orden debe estar en ejecución');
    await db.withTransaction(async (conn) => {
      await repo.update(oid, { diagnostico: d.diagnostico, solucion: d.solucion }, {}, conn);
      await audit(ctx, 'DIAGNOSTICO', 'ORDEN', oid, null, conn);
    });
    return service.get(ctx.user, oid);
  },

  async addDetail(ctx, oid, d) {
    const o = await mustGet(ctx.user, oid);
    assertCanExecute(ctx.user, o);
    if (o.estado !== 'EN_EJECUCION') throw badRequest('Solo se registran actividades o materiales con la orden en ejecución');
    await db.execute('INSERT INTO DETALLE_ORDEN (ORDEN_ID, TIPO, DESCRIPCION, CANTIDAD, COSTO_UNITARIO, REGISTRADO_POR) VALUES (:o, :t, :d, :c, :k, :u)',
      { o: oid, t: d.tipo, d: d.descripcion, c: d.cantidad, k: d.costo_unitario, u: ctx.user.id });
    return service.get(ctx.user, oid);
  },

  async removeDetail(ctx, oid, did) {
    const o = await mustGet(ctx.user, oid);
    assertCanExecute(ctx.user, o);
    if (o.estado !== 'EN_EJECUCION') throw badRequest('La orden no está en ejecución');
    const cond = ctx.user.isStaff ? '' : 'AND REGISTRADO_POR = :u';
    const r = await db.execute(`DELETE FROM DETALLE_ORDEN WHERE ID = :id AND ORDEN_ID = :o ${cond}`, ctx.user.isStaff ? { id: did, o: oid } : { id: did, o: oid, u: ctx.user.id });
    if (!r.rowsAffected) throw notFound('Detalle');
    return service.get(ctx.user, oid);
  },

  async finish(ctx, oid) {
    const o = await mustGet(ctx.user, oid);
    assertCanExecute(ctx.user, o);
    if (o.estado !== 'EN_EJECUCION') throw badRequest('La orden debe estar en ejecución');
    if (!o.diagnostico || !o.diagnostico.trim()) throw badRequest('Registre el diagnóstico antes de finalizar');
    const acts = await db.queryOne(`SELECT COUNT(*) AS N FROM DETALLE_ORDEN WHERE ORDEN_ID = :id AND TIPO = 'ACTIVIDAD'`, { id: oid });
    if (acts.n < 1) throw badRequest('Registre al menos una actividad realizada antes de finalizar');
    await db.withTransaction(async (conn) => {
      await changeState(conn, ctx.user, o, 'FINALIZADA', { fecha_fin: new Date() }, 'Servicio finalizado por el técnico');
      if (o.solicitud_id) {
        const s = await db.queryOne('SELECT * FROM SOLICITUDES WHERE ID = :id', { id: o.solicitud_id }, conn);
        if (s && s.estado === 'EN_PROCESO') await solicitudes.transition(conn, ctx.user, s, 'RESUELTA', `Orden ${o.codigo} finalizada`);
      }
      await notifyStaff(conn, { tipo: 'ORDEN_FINALIZADA', titulo: `Orden ${o.codigo} finalizada`, enlace: link(oid), empresaId: o.empresa_id });
      await notifyCompany(conn, o.empresa_id, { tipo: 'ORDEN_FINALIZADA', titulo: `Su servicio ${o.codigo} fue finalizado`, enlace: link(oid) });
      await audit(ctx, 'FINALIZAR', 'ORDEN', oid, null, conn);
    });
    return service.get(ctx.user, oid);
  },

  async close(ctx, oid) {
    const o = await mustGet(ctx.user, oid);
    await db.withTransaction(async (conn) => {
      await changeState(conn, ctx.user, o, 'CERRADA', { fecha_cierre: new Date() }, 'Orden cerrada');
      if (o.solicitud_id) {
        const s = await db.queryOne('SELECT * FROM SOLICITUDES WHERE ID = :id', { id: o.solicitud_id }, conn);
        if (s && s.estado === 'RESUELTA') await solicitudes.transition(conn, ctx.user, s, 'CERRADA', `Orden ${o.codigo} cerrada`);
      }
      await audit(ctx, 'CERRAR', 'ORDEN', oid, null, conn);
    });
    return service.get(ctx.user, oid);
  },

  async cancel(ctx, oid, motivo) {
    const o = await mustGet(ctx.user, oid);
    await db.withTransaction(async (conn) => {
      await changeState(conn, ctx.user, o, 'CANCELADA', { fecha_cierre: new Date() }, motivo);
      await audit(ctx, 'CANCELAR', 'ORDEN', oid, { motivo }, conn);
    });
    return service.get(ctx.user, oid);
  },
  repo, mustGet, assertCanExecute,
};

const detailSchema = z.object({ tipo: z.enum(['ACTIVIDAD', 'MATERIAL']), descripcion: texto(500), cantidad: z.coerce.number().positive().max(100000).default(1), costo_unitario: z.coerce.number().min(0).max(1e10).default(0) });

const router = express.Router();
router.get('/', requirePerm('ordenes:read'), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
router.get('/:id', requirePerm('ordenes:read'), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
router.post('/', requirePerm('ordenes:manage'), validate(z.object({ solicitud_id: id, tecnico_id: id.nullish(), fecha_programada: fecha.nullish().or(z.literal('')), descripcion_trabajo: textoOpc(4000) })),
  asyncHandler(async (req, res) => res.status(201).json(await service.createFromSolicitud(ctxOf(req), req.valid))));
router.post('/:id/asignar', requirePerm('ordenes:manage'), validate(z.object({ tecnico_id: id })), asyncHandler(async (req, res) => res.json(await service.assign(ctxOf(req), Number(req.params.id), req.valid.tecnico_id))));
router.post('/:id/iniciar', requirePerm('ordenes:execute'), asyncHandler(async (req, res) => res.json(await service.start(ctxOf(req), Number(req.params.id)))));
router.put('/:id/diagnostico', requirePerm('ordenes:execute'), validate(z.object({ diagnostico: texto(4000), solucion: textoOpc(4000) })), asyncHandler(async (req, res) => res.json(await service.diagnose(ctxOf(req), Number(req.params.id), req.valid))));
router.post('/:id/detalle', requirePerm('ordenes:execute'), validate(detailSchema), asyncHandler(async (req, res) => res.status(201).json(await service.addDetail(ctxOf(req), Number(req.params.id), req.valid))));
router.delete('/:id/detalle/:did', requirePerm('ordenes:execute'), asyncHandler(async (req, res) => res.json(await service.removeDetail(ctxOf(req), Number(req.params.id), Number(req.params.did)))));
router.post('/:id/finalizar', requirePerm('ordenes:execute'), asyncHandler(async (req, res) => res.json(await service.finish(ctxOf(req), Number(req.params.id)))));
router.post('/:id/cerrar', requirePerm('ordenes:manage'), asyncHandler(async (req, res) => res.json(await service.close(ctxOf(req), Number(req.params.id)))));
router.post('/:id/cancelar', requirePerm('ordenes:manage'), validate(z.object({ motivo: textoOpc(1000) })), asyncHandler(async (req, res) => res.json(await service.cancel(ctxOf(req), Number(req.params.id), req.valid.motivo))));

module.exports = { router, service, repo };
