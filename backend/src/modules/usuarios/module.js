const express = require('express');
const db = require('../../config/db');
const { createRepository } = require('../../core/repository');
const { badRequest, forbidden, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, id, texto, textoOpc, email, password } = require('../../core/schemas');
const authRepo = require('../auth/repo');
const { hashPassword } = require('../auth/service');

const ROLES = ['SUPERADMIN', 'ADMIN', 'TECNICO', 'CLIENTE'];
const PRIVILEGED = ['SUPERADMIN', 'ADMIN'];

const repo = createRepository({
  table: 'USUARIOS', alias: 'U', columns: ['empresa_id', 'email', 'nombre', 'telefono', 'password_hash', 'activo'],
  // la lista NUNCA incluye password_hash
  select: `U.ID, U.EMPRESA_ID, U.EMAIL, U.NOMBRE, U.TELEFONO, U.ACTIVO, U.ULTIMO_ACCESO, U.CREADO_EN`,
  selectExtra: `E.RAZON_SOCIAL AS EMPRESA_NOMBRE, (SELECT LISTAGG(R.CODIGO, ',') WITHIN GROUP (ORDER BY R.CODIGO) FROM USUARIO_ROL UR JOIN ROLES R ON R.ID = UR.ROL_ID WHERE UR.USUARIO_ID = U.ID) AS ROLES`,
  joins: 'LEFT JOIN EMPRESAS E ON E.ID = U.EMPRESA_ID', searchable: ['nombre', 'email'], filters: ['empresa_id', 'activo'],
  customFilters: { rol: 'EXISTS (SELECT 1 FROM USUARIO_ROL UR2 JOIN ROLES R2 ON R2.ID = UR2.ROL_ID WHERE UR2.USUARIO_ID = U.ID AND R2.CODIGO = :v)' },
  orderBy: 'U.NOMBRE',
});

const shape = (u) => (u ? { ...u, roles: u.roles ? u.roles.split(',') : [] } : u);

async function get(id_) {
  const u = shape(await repo.findById(id_));
  if (!u) throw notFound('Usuario');
  return u;
}

/** ADMIN solo gestiona TECNICO y CLIENTE; SUPERADMIN gestiona a todos. */
function assertCanManage(actor, roles) {
  if (!actor.isSuperAdmin && roles.some((r) => PRIVILEGED.includes(r))) throw forbidden('Solo un SUPERADMIN puede gestionar administradores');
}

function validateRoleRules(roles, empresaId) {
  if (!roles.length) throw badRequest('Debe asignar al menos un rol');
  if (roles.includes('CLIENTE') && roles.length > 1) throw badRequest('El rol CLIENTE no puede combinarse con otros roles');
  if (roles.includes('CLIENTE') && !empresaId) throw badRequest('Un usuario CLIENTE debe estar vinculado a una empresa');
  if (!roles.includes('CLIENTE') && empresaId) throw badRequest('Solo los usuarios CLIENTE se vinculan a una empresa');
}

async function setRoles(conn, userId, roles) {
  await db.execute('DELETE FROM USUARIO_ROL WHERE USUARIO_ID = :id', { id: userId }, conn);
  for (const code of roles) {
    await db.execute('INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID) SELECT :u, ID FROM ROLES WHERE CODIGO = :c', { u: userId, c: code }, conn);
  }
}

async function assertCompanyActive(empresaId) {
  if (!empresaId) return;
  const e = await db.queryOne('SELECT ACTIVO FROM EMPRESAS WHERE ID = :id', { id: empresaId });
  if (!e || !e.activo) throw badRequest('La empresa no existe o está inactiva');
}

const service = {
  async list(user, query) {
    const r = await repo.list(query, {});
    r.data = r.data.map(shape);
    return r;
  },
  get: (user, id_) => get(id_),
  async create(ctx, d) {
    assertCanManage(ctx.user, d.roles);
    validateRoleRules(d.roles, d.empresa_id);
    await assertCompanyActive(d.empresa_id);
    const hash = await hashPassword(d.password);
    const newId = await db.withTransaction(async (conn) => {
      const uid = await repo.create({ empresa_id: d.empresa_id ?? null, email: d.email, nombre: d.nombre, telefono: d.telefono, password_hash: hash, activo: 1 }, conn);
      await setRoles(conn, uid, d.roles);
      await audit(ctx, 'CREAR', 'USUARIO', uid, { roles: d.roles }, conn);
      return uid;
    });
    return get(newId);
  },
  async update(ctx, userId, d) {
    const current = await get(userId);
    assertCanManage(ctx.user, current.roles);
    const roles = d.roles || current.roles;
    const empresaId = d.empresa_id !== undefined ? d.empresa_id : current.empresa_id;
    if (d.roles) assertCanManage(ctx.user, d.roles);
    validateRoleRules(roles, empresaId);
    await assertCompanyActive(empresaId);
    await db.withTransaction(async (conn) => {
      await repo.update(userId, { empresa_id: empresaId ?? null, email: d.email, nombre: d.nombre, telefono: d.telefono }, {}, conn);
      if (d.roles) await setRoles(conn, userId, d.roles);
      await audit(ctx, 'ACTUALIZAR', 'USUARIO', userId, { roles: d.roles }, conn);
    });
    return get(userId);
  },
  async setActive(ctx, userId, activo) {
    if (userId === ctx.user.id && !activo) throw badRequest('No puede desactivar su propia cuenta');
    const current = await get(userId);
    assertCanManage(ctx.user, current.roles);
    await db.withTransaction(async (conn) => {
      await repo.setActive(userId, activo, {}, conn);
      if (!activo) await authRepo.revokeAllForUser(userId, conn);
      await audit(ctx, activo ? 'ACTIVAR' : 'DESACTIVAR', 'USUARIO', userId, null, conn);
    });
    return get(userId);
  },
  async resetPassword(ctx, userId, nueva) {
    const current = await get(userId);
    assertCanManage(ctx.user, current.roles);
    await db.withTransaction(async (conn) => {
      await authRepo.setPassword(userId, await hashPassword(nueva), conn);
      await authRepo.revokeAllForUser(userId, conn);
      await audit(ctx, 'RESET_PASSWORD_ADMIN', 'USUARIO', userId, null, conn);
    });
  },
};

const base = z.object({
  empresa_id: id.nullish(), email, nombre: texto(150), telefono: textoOpc(40), roles: z.array(z.enum(ROLES)).min(1),
});
const createSchema = base.extend({ password });
const updateSchema = base.partial();

const router = express.Router();
router.get('/', requirePerm('usuarios:read'), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
router.get('/:id', requirePerm('usuarios:read'), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
router.post('/', requirePerm('usuarios:write'), validate(createSchema), asyncHandler(async (req, res) => res.status(201).json(await service.create(ctxOf(req), req.valid))));
router.put('/:id', requirePerm('usuarios:write'), validate(updateSchema), asyncHandler(async (req, res) => res.json(await service.update(ctxOf(req), Number(req.params.id), req.valid))));
router.patch('/:id/activo', requirePerm('usuarios:write'), validate(z.object({ activo: z.boolean() })), asyncHandler(async (req, res) => res.json(await service.setActive(ctxOf(req), Number(req.params.id), req.valid.activo))));
router.put('/:id/password', requirePerm('usuarios:write'), validate(z.object({ nueva: password })), asyncHandler(async (req, res) => { await service.resetPassword(ctxOf(req), Number(req.params.id), req.valid.nueva); res.status(204).end(); }));

module.exports = { router, service, validateRoleRules, assertCanManage };
