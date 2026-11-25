const express = require('express');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { badRequest, forbidden, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { recordState } = require('../../core/history');
const { notifyStaff, notifyUsers, notifyCompany } = require('../../core/notify');
const { SOLICITUD, assertTransition, canTransition } = require('../../core/states');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');

const repo = createRepository({
  table: 'SOLICITUDES', alias: 'S',
  columns: ['empresa_id', 'sede_id', 'equipo_id', 'servicio_id', 'solicitante_id', 'tecnico_id', 'categoria', 'asunto', 'descripcion', 'prioridad', 'estado', 'fecha_programada', 'fecha_cierre', 'observaciones'],
  readOnlyColumns: ['codigo'], dateColumns: ['fecha_programada', 'fecha_cierre'],
  searchable: ['asunto', 'descripcion', 'codigo'], filters: ['empresa_id', 'sede_id', 'equipo_id', 'servicio_id', 'categoria', 'prioridad', 'estado', 'tecnico_id'], notFilters: ['estado'],
  joins: `JOIN EMPRESAS E ON E.ID = S.EMPRESA_ID LEFT JOIN SEDES SD ON SD.ID = S.SEDE_ID LEFT JOIN EQUIPOS Q ON Q.ID = S.EQUIPO_ID
          LEFT JOIN USUARIOS TU ON TU.ID = S.TECNICO_ID LEFT JOIN SERVICIOS SV ON SV.ID = S.SERVICIO_ID`,
  selectExtra: 'E.RAZON_SOCIAL AS EMPRESA_NOMBRE, SD.NOMBRE AS SEDE_NOMBRE, Q.NOMBRE AS EQUIPO_NOMBRE, TU.NOMBRE AS TECNICO_NOMBRE, SV.NOMBRE AS SERVICIO_NOMBRE',
  empresaColumn: 'empresa_id', tecnicoColumn: 'tecnico_id',
});

const link = (sid) => `/solicitudes/${sid}`;

async function mustGet(user, sid, conn) {
  const s = await repo.findById(sid, repo.scopeFor(user), conn);
  if (!s) throw notFound('Solicitud');
  return s;
}

/** Cambia estado validando la máquina de estados y dejando rastro en el historial. */
async function transition(conn, user, s, nuevo, comentario) {
  assertTransition(SOLICITUD, s.estado, nuevo, 'solicitud');
  const extra = ['CERRADA', 'CANCELADA'].includes(nuevo) ? { fecha_cierre: new Date() } : {};
  await repo.update(s.id, { estado: nuevo, ...extra }, {}, conn);
  await recordState(conn, { entidad: 'SOLICITUD', entidadId: s.id, anterior: s.estado, nuevo, comentario, usuarioId: user.id, empresaId: s.empresa_id, equipoId: s.equipo_id });
}

async function validateRefs(d, empresaId, conn = null) {
  if (d.sede_id) {
    const sede = await db.queryOne('SELECT EMPRESA_ID, ACTIVO FROM SEDES WHERE ID = :id', { id: d.sede_id }, conn);
    if (!sede || sede.empresa_id !== empresaId || !sede.activo) throw badRequest('La sede no es válida para su empresa');
  }
  if (d.equipo_id) {
    const eq = await db.queryOne('SELECT EMPRESA_ID, SEDE_ID FROM EQUIPOS WHERE ID = :id AND ACTIVO = 1', { id: d.equipo_id }, conn);
    if (!eq || eq.empresa_id !== empresaId) throw badRequest('El equipo no pertenece a su empresa');
  }
  if (d.servicio_id) {
    const sv = await db.queryOne('SELECT ACTIVO FROM SERVICIOS WHERE ID = :id', { id: d.servicio_id }, conn);
    if (!sv || !sv.activo) throw badRequest('El servicio no existe o está inactivo');
  }
}

async function assertTecnico(tecnicoId, conn) {
  const t = await db.queryOne(
    `SELECT U.ID FROM USUARIOS U JOIN USUARIO_ROL UR ON UR.USUARIO_ID = U.ID JOIN ROLES R ON R.ID = UR.ROL_ID WHERE U.ID = :id AND U.ACTIVO = 1 AND R.CODIGO = 'TECNICO'`, { id: tecnicoId }, conn);
  if (!t) throw badRequest('El técnico indicado no existe o no está activo');
}

const service = {
  list: (user, query) => repo.list(query, repo.scopeFor(user)),

  async get(user, sid) {
    const s = await mustGet(user, sid);
    s.adjuntos = await db.query(
      `SELECT ID, TIPO, NOMBRE_ORIGINAL, MIME, TAMANO, CREADO_EN FROM ADJUNTOS WHERE ENTIDAD = 'SOLICITUD' AND ENTIDAD_ID = :id AND ACTIVO = 1 ORDER BY ID`, { id: sid });
    s.historial = await db.query(
      `SELECT H.ID, H.ESTADO_ANTERIOR, H.ESTADO_NUEVO, H.COMENTARIO, H.FECHA, U.NOMBRE AS USUARIO_NOMBRE FROM HISTORIAL_ESTADOS H LEFT JOIN USUARIOS U ON U.ID = H.USUARIO_ID
        WHERE H.ENTIDAD = 'SOLICITUD' AND H.ENTIDAD_ID = :id ORDER BY H.FECHA, H.ID`, { id: sid });
    if (!user.isTecnicoOnly) {
      const clientFilter = user.isClient ? "AND ESTADO <> 'BORRADOR'" : '';
      s.cotizaciones = await db.query(`SELECT ID, CODIGO, ESTADO, TOTAL, VALIDEZ_HASTA FROM COTIZACIONES WHERE SOLICITUD_ID = :id ${clientFilter} ORDER BY ID DESC`, { id: sid });
    }
    s.ordenes = await db.query(`SELECT ID, CODIGO, ESTADO FROM ORDENES_SERVICIO WHERE SOLICITUD_ID = :id ${user.isTecnicoOnly ? 'AND TECNICO_ID = :uid' : ''} ORDER BY ID DESC`,
      user.isTecnicoOnly ? { id: sid, uid: user.id } : { id: sid });
    return s;
  },

  async createRecord(ctx, d, conn) {
    const { user } = ctx;
    // El contexto empresarial sale de la identidad autenticada; el valor enviado por el front se ignora para clientes.
    const empresaId = user.isClient ? user.empresaId : d.empresa_id;
    if (!empresaId) throw badRequest('empresa_id es obligatorio');
    const emp = await db.queryOne('SELECT ACTIVO FROM EMPRESAS WHERE ID = :id', { id: empresaId }, conn);
    if (!emp || !emp.activo) throw badRequest('La empresa no existe o está inactiva');
    await validateRefs(d, empresaId, conn);
    const newId = await repo.create({
      empresa_id: empresaId, sede_id: d.sede_id, equipo_id: d.equipo_id, servicio_id: d.servicio_id, solicitante_id: user.id,
      categoria: d.categoria, asunto: d.asunto, descripcion: d.descripcion, prioridad: d.prioridad, estado: 'NUEVA',
    }, conn);
    await recordState(conn, { entidad: 'SOLICITUD', entidadId: newId, nuevo: 'NUEVA', comentario: 'Solicitud creada', usuarioId: user.id, empresaId, equipoId: d.equipo_id });
    await notifyStaff(conn, { tipo: 'SOLICITUD_NUEVA', titulo: 'Nueva solicitud de soporte', mensaje: d.asunto, enlace: link(newId), empresaId });
    await audit(ctx, 'CREAR', 'SOLICITUD', newId, null, conn);
    return newId;
  },

  async create(ctx, d) {
    const sid = await db.withTransaction((conn) => service.createRecord(ctx, d, conn));
    return service.get(ctx.user, sid);
  },

  /** Solo personal MS: prioridad, categoría, servicio, fecha programada y observaciones. */
  async update(ctx, sid, d) {
    const s = await mustGet(ctx.user, sid);
    if (['CERRADA', 'CANCELADA'].includes(s.estado)) throw badRequest('La solicitud ya está finalizada');
    if (d.servicio_id) await validateRefs({ servicio_id: d.servicio_id }, s.empresa_id);
    await db.withTransaction(async (conn) => {
      await repo.update(sid, d, {}, conn);
      await audit(ctx, 'ACTUALIZAR', 'SOLICITUD', sid, Object.keys(d), conn);
    });
    return service.get(ctx.user, sid);
  },

  async changeStatus(ctx, sid, estado, comentario) {
    const s = await mustGet(ctx.user, sid);
    await db.withTransaction(async (conn) => {
      await transition(conn, ctx.user, s, estado, comentario);
      await notifyCompany(conn, s.empresa_id, { tipo: 'SOLICITUD_ESTADO', titulo: `Solicitud ${s.codigo}: ${estado.replace('_', ' ').toLowerCase()}`, mensaje: s.asunto, enlace: link(sid) });
      await audit(ctx, 'CAMBIO_ESTADO', 'SOLICITUD', sid, { de: s.estado, a: estado }, conn);
    });
    return service.get(ctx.user, sid);
  },

  async cancel(ctx, sid, motivo) {
    const s = await mustGet(ctx.user, sid); // scope: solo su empresa
    if (!['NUEVA', 'EN_REVISION'].includes(s.estado)) throw badRequest('Solo se pueden cancelar solicitudes nuevas o en revisión');
    await db.withTransaction(async (conn) => {
      await transition(conn, ctx.user, s, 'CANCELADA', motivo || 'Cancelada por el cliente');
      await notifyStaff(conn, { tipo: 'SOLICITUD_CANCELADA', titulo: `Solicitud ${s.codigo} cancelada por el cliente`, mensaje: s.asunto, enlace: link(sid), empresaId: s.empresa_id });
      await audit(ctx, 'CANCELAR', 'SOLICITUD', sid, null, conn);
    });
    return service.get(ctx.user, sid);
  },

  async assign(ctx, sid, tecnicoId) {
    const s = await mustGet(ctx.user, sid);
    if (['CERRADA', 'CANCELADA'].includes(s.estado)) throw badRequest('La solicitud ya está finalizada');
    await assertTecnico(tecnicoId);
    await db.withTransaction(async (conn) => {
      await repo.update(sid, { tecnico_id: tecnicoId }, {}, conn);
      await db.execute(`UPDATE ASIGNACIONES SET ACTIVA = 0 WHERE ENTIDAD = 'SOLICITUD' AND ENTIDAD_ID = :id`, { id: sid }, conn);
      await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('SOLICITUD', :id, :t, :u)`, { id: sid, t: tecnicoId, u: ctx.user.id }, conn);
      if (s.estado === 'NUEVA') await transition(conn, ctx.user, s, 'EN_REVISION', 'Asignada a técnico');
      await notifyUsers(conn, [tecnicoId], { tipo: 'SOLICITUD_ASIGNADA', titulo: `Se le asignó la solicitud ${s.codigo}`, mensaje: s.asunto, enlace: link(sid), empresaId: s.empresa_id });
      await audit(ctx, 'ASIGNAR', 'SOLICITUD', sid, { tecnicoId }, conn);
    });
    return service.get(ctx.user, sid);
  },
  repo, transition, mustGet,
};

const createSchema = z.object({
  empresa_id: id.optional(), sede_id: id.nullish(), equipo_id: id.nullish(), servicio_id: id.nullish(),
  categoria: z.enum(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'OTRO']), asunto: texto(200), descripcion: texto(4000),
  prioridad: z.enum(['BAJA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
});
const updateSchema = z.object({
  prioridad: z.enum(['BAJA', 'MEDIA', 'ALTA', 'URGENTE']).optional(), categoria: z.enum(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'OTRO']).optional(),
  servicio_id: id.nullish(), fecha_programada: fecha.nullish().or(z.literal('')), observaciones: textoOpc(4000),
});

const router = express.Router();
router.get('/', requirePerm('solicitudes:read'), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
router.get('/:id', requirePerm('solicitudes:read'), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
router.post('/', requirePerm('solicitudes:create'), validate(createSchema), asyncHandler(async (req, res) => res.status(201).json(await service.create(ctxOf(req), req.valid))));
router.put('/:id', requirePerm('solicitudes:manage'), validate(updateSchema), asyncHandler(async (req, res) => res.json(await service.update(ctxOf(req), Number(req.params.id), req.valid))));
router.patch('/:id/estado', requirePerm('solicitudes:manage'), validate(z.object({ estado: z.enum(Object.keys(SOLICITUD)), comentario: textoOpc(1000) })),
  asyncHandler(async (req, res) => res.json(await service.changeStatus(ctxOf(req), Number(req.params.id), req.valid.estado, req.valid.comentario))));
router.post('/:id/cancelar', requirePerm('solicitudes:cancel', 'solicitudes:manage'), validate(z.object({ motivo: textoOpc(1000) })),
  asyncHandler(async (req, res) => res.json(await service.cancel(ctxOf(req), Number(req.params.id), req.valid.motivo))));
router.post('/:id/asignar', requirePerm('solicitudes:manage'), validate(z.object({ tecnico_id: id })),
  asyncHandler(async (req, res) => res.json(await service.assign(ctxOf(req), Number(req.params.id), req.valid.tecnico_id))));

module.exports = { router, service, repo, transition, assertTecnico };
