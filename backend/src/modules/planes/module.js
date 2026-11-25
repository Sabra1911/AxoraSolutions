const express = require('express');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { createCrudService, createCrudRoutes } = require('../../core/crud');
const { badRequest, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { requirePerm } = require('../../middleware/auth');
const { parseLocalDate } = require('../../core/dates');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');

// ---------- Planes ----------
const planesRepo = createRepository({
  table: 'PLANES', alias: 'P', columns: ['codigo', 'nombre', 'descripcion', 'alcance', 'precio_mensual', 'visitas_mes', 'activo'],
  searchable: ['nombre', 'codigo'], filters: ['activo'], orderBy: 'P.NOMBRE',
  selectExtra: `(SELECT LISTAGG(SV.NOMBRE, ', ') WITHIN GROUP (ORDER BY SV.NOMBRE) FROM PLAN_SERVICIO PS JOIN SERVICIOS SV ON SV.ID = PS.SERVICIO_ID WHERE PS.PLAN_ID = P.ID) AS SERVICIOS_INCLUIDOS`,
});
const planesBase = createCrudService({ repo: planesRepo, entity: 'PLAN', label: 'Plan' });
const getPlan = async (user, planId) => {
  const plan = await planesBase.get(user, planId);
  plan.servicio_ids = (await db.query('SELECT SERVICIO_ID FROM PLAN_SERVICIO WHERE PLAN_ID = :id', { id: planId })).map((r) => r.servicio_id);
  return plan;
};
async function setServicios(conn, planId, ids) {
  await db.execute('DELETE FROM PLAN_SERVICIO WHERE PLAN_ID = :id', { id: planId }, conn);
  for (const s of [...new Set(ids)]) await db.execute('INSERT INTO PLAN_SERVICIO (PLAN_ID, SERVICIO_ID) VALUES (:p, :s)', { p: planId, s }, conn);
}
const planes = {
  list: planesBase.list,
  get: getPlan,
  setActive: planesBase.setActive,
  async create(ctx, data) {
    const { servicio_ids = [], ...rest } = data;
    const planId = await db.withTransaction(async (conn) => {
      const pid = await planesRepo.create(rest, conn);
      await setServicios(conn, pid, servicio_ids);
      await audit(ctx, 'CREAR', 'PLAN', pid, null, conn);
      return pid;
    });
    return getPlan(ctx.user, planId);
  },
  async update(ctx, planId, data) {
    await planesBase.get(ctx.user, planId);
    const { servicio_ids, ...rest } = data;
    await db.withTransaction(async (conn) => {
      await planesRepo.update(planId, rest, {}, conn);
      if (servicio_ids) await setServicios(conn, planId, servicio_ids);
      await audit(ctx, 'ACTUALIZAR', 'PLAN', planId, null, conn);
    });
    return getPlan(ctx.user, planId);
  },
};
const planBase = z.object({
  codigo: texto(30), nombre: texto(150), descripcion: textoOpc(1000), alcance: textoOpc(2000),
  precio_mensual: z.coerce.number().min(0), visitas_mes: z.coerce.number().int().min(0).max(100).default(1), servicio_ids: z.array(id).optional(),
});
const planesRouter = createCrudRoutes({ service: planes, read: 'planes:read', write: 'planes:write', createSchema: planBase, updateSchema: planBase.partial() });

// ---------- Contratos ----------
const contratosRepo = createRepository({
  table: 'CONTRATOS', alias: 'K', columns: ['empresa_id', 'plan_id', 'fecha_inicio', 'fecha_fin', 'precio_mensual', 'estado', 'observaciones'],
  dateColumns: ['fecha_inicio', 'fecha_fin'], readOnlyColumns: ['codigo'], searchable: ['codigo'], filters: ['empresa_id', 'plan_id', 'estado'],
  joins: 'JOIN EMPRESAS E ON E.ID = K.EMPRESA_ID JOIN PLANES P ON P.ID = K.PLAN_ID',
  selectExtra: 'E.RAZON_SOCIAL AS EMPRESA_NOMBRE, P.NOMBRE AS PLAN_NOMBRE', empresaColumn: 'empresa_id', dateRangeColumn: 'fecha_inicio', hasUpdatedAt: true,
});
async function contratoRules(user, data, current) {
  const empresaId = data.empresa_id ?? current?.empresa_id;
  const planId = data.plan_id ?? current?.plan_id;
  const inicio = parseLocalDate(data.fecha_inicio ?? current?.fecha_inicio);
  const fin = parseLocalDate(data.fecha_fin ?? current?.fecha_fin);
  if (fin <= inicio) throw badRequest('La fecha de fin debe ser posterior a la de inicio');
  const emp = await db.queryOne('SELECT ACTIVO FROM EMPRESAS WHERE ID = :id', { id: empresaId });
  if (!emp || !emp.activo) throw badRequest('La empresa no existe o está inactiva');
  const plan = await db.queryOne('SELECT ACTIVO, PRECIO_MENSUAL FROM PLANES WHERE ID = :id', { id: planId });
  if (!plan || (!current && !plan.activo)) throw badRequest('El plan no existe o está inactivo');
  const estado = data.estado ?? current?.estado ?? 'VIGENTE';
  if (estado === 'VIGENTE') {
    const overlap = await db.queryOne(
      `SELECT COUNT(*) AS N FROM CONTRATOS WHERE EMPRESA_ID = :e AND PLAN_ID = :p AND ESTADO = 'VIGENTE' AND FECHA_INICIO < :fin AND FECHA_FIN > :ini AND (:cid IS NULL OR ID <> :cid2)`,
      { e: empresaId, p: planId, fin, ini: inicio, cid: current?.id ?? null, cid2: current?.id ?? null });
    if (overlap.n > 0) throw badRequest('Ya existe un contrato vigente de ese plan para la empresa en ese periodo');
  }
  if (!current && data.precio_mensual === undefined) data.precio_mensual = plan.precio_mensual;
  return data;
}
const contratos = createCrudService({ repo: contratosRepo, entity: 'CONTRATO', label: 'Contrato', beforeWrite: contratoRules });
const contratoBase = z.object({
  empresa_id: id, plan_id: id, fecha_inicio: fecha, fecha_fin: fecha, precio_mensual: z.coerce.number().min(0).optional(),
  estado: z.enum(['VIGENTE', 'SUSPENDIDO', 'VENCIDO', 'CANCELADO']).default('VIGENTE'), observaciones: textoOpc(2000),
});
const contratosRouter = createCrudRoutes({ service: contratos, read: 'contratos:read', write: 'contratos:write', createSchema: contratoBase, updateSchema: contratoBase.partial() });
// Los contratos no se "desactivan": se cambia su estado (SUSPENDIDO/CANCELADO). Se retira la ruta /activo.
contratosRouter.stack = contratosRouter.stack.filter((l) => !(l.route && l.route.path === '/:id/activo'));

module.exports = { planesRouter, contratosRouter };
