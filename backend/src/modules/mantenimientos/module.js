const express = require('express');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { badRequest, forbidden, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { recordState } = require('../../core/history');
const { notifyUsers, notifyCompany, notifyStaff } = require('../../core/notify');
const { MANTENIMIENTO, assertTransition } = require('../../core/states');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');
const { assertTecnico } = require('../solicitudes/module');
const { parseLocalDate, startOfToday } = require('../../core/dates');

const repo = createRepository({
  table: 'MANTENIMIENTOS', alias: 'M',
  columns: ['empresa_id', 'sede_id', 'equipo_id', 'contrato_id', 'tecnico_id', 'creado_por', 'tipo', 'titulo', 'descripcion', 'estado', 'fecha_programada', 'frecuencia_dias', 'fecha_inicio', 'fecha_ejecucion', 'resultado', 'proximo_vencimiento'],
  readOnlyColumns: ['codigo'], dateColumns: ['fecha_programada', 'fecha_inicio', 'fecha_ejecucion', 'proximo_vencimiento'],
  searchable: ['titulo', 'codigo'], filters: ['empresa_id', 'sede_id', 'equipo_id', 'tecnico_id', 'tipo', 'estado', 'contrato_id'], dateRangeColumn: 'fecha_programada',
  joins: 'JOIN EMPRESAS E ON E.ID = M.EMPRESA_ID LEFT JOIN SEDES SD ON SD.ID = M.SEDE_ID LEFT JOIN EQUIPOS Q ON Q.ID = M.EQUIPO_ID LEFT JOIN USUARIOS TU ON TU.ID = M.TECNICO_ID',
  selectExtra: 'E.RAZON_SOCIAL AS EMPRESA_NOMBRE, SD.NOMBRE AS SEDE_NOMBRE, Q.NOMBRE AS EQUIPO_NOMBRE, TU.NOMBRE AS TECNICO_NOMBRE, (CASE WHEN M.ESTADO = \'PROGRAMADO\' AND M.FECHA_PROGRAMADA < TRUNC(SYSDATE) THEN 1 ELSE 0 END) AS VENCIDO',
  orderBy: 'M.FECHA_PROGRAMADA', empresaColumn: 'empresa_id', tecnicoColumn: 'tecnico_id',
});

const link = (mid) => `/mantenimientos`;
const DAY = 86400000;

async function mustGet(user, mid, conn) {
  const m = await repo.findById(mid, repo.scopeFor(user), conn);
  if (!m) throw notFound('Mantenimiento');
  return m;
}
function assertCanExecute(user, m) {
  if (user.isStaff) return;
  if (!user.permisos.has('mantenimientos:execute') || m.tecnico_id !== user.id) throw forbidden('Este mantenimiento no está asignado a usted');
}
async function checkRefs(d, current) {
  const empresaId = d.empresa_id ?? current?.empresa_id;
  const emp = await db.queryOne('SELECT ACTIVO FROM EMPRESAS WHERE ID = :id', { id: empresaId });
  if (!emp || !emp.activo) throw badRequest('La empresa no existe o está inactiva');
  const sedeId = d.sede_id !== undefined ? d.sede_id : current?.sede_id;
  if (sedeId) {
    const s = await db.queryOne('SELECT EMPRESA_ID FROM SEDES WHERE ID = :id', { id: sedeId });
    if (!s || s.empresa_id !== empresaId) throw badRequest('La sede no pertenece a la empresa');
  }
  const equipoId = d.equipo_id !== undefined ? d.equipo_id : current?.equipo_id;
  if (equipoId) {
    const q = await db.queryOne('SELECT EMPRESA_ID FROM EQUIPOS WHERE ID = :id', { id: equipoId });
    if (!q || q.empresa_id !== empresaId) throw badRequest('El equipo no pertenece a la empresa');
  }
  const contratoId = d.contrato_id !== undefined ? d.contrato_id : current?.contrato_id;
  if (contratoId) {
    const k = await db.queryOne('SELECT EMPRESA_ID FROM CONTRATOS WHERE ID = :id', { id: contratoId });
    if (!k || k.empresa_id !== empresaId) throw badRequest('El contrato no pertenece a la empresa');
  }
  if (d.tecnico_id) await assertTecnico(d.tecnico_id);
}

async function change(conn, user, m, nuevo, extra = {}, comentario) {
  assertTransition(MANTENIMIENTO, m.estado, nuevo, 'mantenimiento');
  await repo.update(m.id, { estado: nuevo, ...extra }, {}, conn);
  await recordState(conn, { entidad: 'MANTENIMIENTO', entidadId: m.id, anterior: m.estado, nuevo, comentario, usuarioId: user.id, empresaId: m.empresa_id, equipoId: m.equipo_id });
}

const service = {
  list: (user, query) => repo.list(query, repo.scopeFor(user)),
  get: (user, mid) => mustGet(user, mid),

  async create(ctx, d) {
    await checkRefs(d, null);
    if (parseLocalDate(d.fecha_programada) < startOfToday()) throw badRequest('La fecha programada no puede estar en el pasado');
    const mid = await db.withTransaction(async (conn) => {
      const newId = await repo.create({ ...d, creado_por: ctx.user.id, estado: 'PROGRAMADO' }, conn);
      if (d.tecnico_id) {
        await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('MANTENIMIENTO', :id, :t, :u)`, { id: newId, t: d.tecnico_id, u: ctx.user.id }, conn);
        await notifyUsers(conn, [d.tecnico_id], { tipo: 'MANTENIMIENTO_ASIGNADO', titulo: 'Mantenimiento asignado', mensaje: d.titulo, enlace: link(newId), empresaId: d.empresa_id });
      }
      await recordState(conn, { entidad: 'MANTENIMIENTO', entidadId: newId, nuevo: 'PROGRAMADO', comentario: d.titulo, usuarioId: ctx.user.id, empresaId: d.empresa_id, equipoId: d.equipo_id });
      await notifyCompany(conn, d.empresa_id, { tipo: 'MANTENIMIENTO_PROGRAMADO', titulo: 'Mantenimiento programado', mensaje: d.titulo, enlace: link(newId) });
      await audit(ctx, 'CREAR', 'MANTENIMIENTO', newId, null, conn);
      return newId;
    });
    return mustGet(ctx.user, mid);
  },

  async update(ctx, mid, d) {
    const m = await mustGet(ctx.user, mid);
    if (m.estado !== 'PROGRAMADO') throw badRequest('Solo se editan mantenimientos programados');
    await checkRefs(d, m);
    await db.withTransaction(async (conn) => {
      const { empresa_id, ...rest } = d; // la empresa no se reasigna
      await repo.update(mid, rest, {}, conn);
      if (d.tecnico_id && d.tecnico_id !== m.tecnico_id) {
        await db.execute(`UPDATE ASIGNACIONES SET ACTIVA = 0 WHERE ENTIDAD = 'MANTENIMIENTO' AND ENTIDAD_ID = :id`, { id: mid }, conn);
        await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('MANTENIMIENTO', :id, :t, :u)`, { id: mid, t: d.tecnico_id, u: ctx.user.id }, conn);
        await notifyUsers(conn, [d.tecnico_id], { tipo: 'MANTENIMIENTO_ASIGNADO', titulo: 'Mantenimiento asignado', mensaje: m.titulo, enlace: link(mid), empresaId: m.empresa_id });
      }
      await audit(ctx, 'ACTUALIZAR', 'MANTENIMIENTO', mid, null, conn);
    });
    return mustGet(ctx.user, mid);
  },

  async start(ctx, mid) {
    const m = await mustGet(ctx.user, mid);
    assertCanExecute(ctx.user, m);
    await db.withTransaction(async (conn) => {
      await change(conn, ctx.user, m, 'EN_EJECUCION', { fecha_inicio: new Date() });
      await audit(ctx, 'INICIAR', 'MANTENIMIENTO', mid, null, conn);
    });
    return mustGet(ctx.user, mid);
  },

  /** Al completar un mantenimiento periódico se programa automáticamente el siguiente. */
  async complete(ctx, mid, resultado) {
    const m = await mustGet(ctx.user, mid);
    assertCanExecute(ctx.user, m);
    const now = new Date();
    const proximo = m.frecuencia_dias ? new Date(now.getTime() + m.frecuencia_dias * DAY) : null;
    await db.withTransaction(async (conn) => {
      await change(conn, ctx.user, m, 'COMPLETADO', { fecha_ejecucion: now, resultado, proximo_vencimiento: proximo }, resultado);
      if (proximo) {
        const nextId = await repo.create({
          empresa_id: m.empresa_id, sede_id: m.sede_id, equipo_id: m.equipo_id, contrato_id: m.contrato_id, tecnico_id: m.tecnico_id, creado_por: m.creado_por,
          tipo: m.tipo, titulo: m.titulo, descripcion: m.descripcion, estado: 'PROGRAMADO', fecha_programada: proximo, frecuencia_dias: m.frecuencia_dias,
        }, conn);
        await recordState(conn, { entidad: 'MANTENIMIENTO', entidadId: nextId, nuevo: 'PROGRAMADO', comentario: 'Programado automáticamente', usuarioId: ctx.user.id, empresaId: m.empresa_id, equipoId: m.equipo_id });
      }
      await notifyCompany(conn, m.empresa_id, { tipo: 'MANTENIMIENTO_COMPLETADO', titulo: 'Mantenimiento completado', mensaje: m.titulo, enlace: link(mid) });
      await notifyStaff(conn, { tipo: 'MANTENIMIENTO_COMPLETADO', titulo: `Mantenimiento ${m.codigo} completado`, enlace: link(mid), empresaId: m.empresa_id });
      await audit(ctx, 'COMPLETAR', 'MANTENIMIENTO', mid, null, conn);
    });
    return mustGet(ctx.user, mid);
  },

  async cancel(ctx, mid, motivo) {
    const m = await mustGet(ctx.user, mid);
    await db.withTransaction(async (conn) => {
      await change(conn, ctx.user, m, 'CANCELADO', {}, motivo);
      await audit(ctx, 'CANCELAR', 'MANTENIMIENTO', mid, { motivo }, conn);
    });
    return mustGet(ctx.user, mid);
  },
};

const base = z.object({
  empresa_id: id, sede_id: id.nullish(), equipo_id: id.nullish(), contrato_id: id.nullish(), tecnico_id: id.nullish(),
  tipo: z.enum(['PREVENTIVO', 'CORRECTIVO']), titulo: texto(200), descripcion: textoOpc(2000), fecha_programada: fecha,
  frecuencia_dias: z.coerce.number().int().min(1).max(730).nullish(),
});

const router = express.Router();
router.get('/', requirePerm('mantenimientos:read'), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
router.get('/:id', requirePerm('mantenimientos:read'), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
router.post('/', requirePerm('mantenimientos:manage'), validate(base), asyncHandler(async (req, res) => res.status(201).json(await service.create(ctxOf(req), req.valid))));
router.put('/:id', requirePerm('mantenimientos:manage'), validate(base.partial()), asyncHandler(async (req, res) => res.json(await service.update(ctxOf(req), Number(req.params.id), req.valid))));
router.post('/:id/iniciar', requirePerm('mantenimientos:execute'), asyncHandler(async (req, res) => res.json(await service.start(ctxOf(req), Number(req.params.id)))));
router.post('/:id/completar', requirePerm('mantenimientos:execute'), validate(z.object({ resultado: texto(4000) })), asyncHandler(async (req, res) => res.json(await service.complete(ctxOf(req), Number(req.params.id), req.valid.resultado))));
router.post('/:id/cancelar', requirePerm('mantenimientos:manage'), validate(z.object({ motivo: textoOpc(1000) })), asyncHandler(async (req, res) => res.json(await service.cancel(ctxOf(req), Number(req.params.id), req.valid.motivo))));

module.exports = { router, service, repo };
