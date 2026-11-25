const db = require('../../config/db');
const repos = require('./repo');
const { createCrudService } = require('../../core/crud');
const { badRequest, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { recordState } = require('../../core/history');
const auth = require('../auth/repo');

const empresas = createCrudService({ repo: repos.empresas, entity: 'EMPRESA', label: 'Empresa' });

/** Desactivar una empresa desactiva a sus usuarios y revoca sus sesiones, en una sola transacción. */
empresas.setActive = async (ctx, id, activo) => {
  await empresas.get(ctx.user, id);
  await db.withTransaction(async (conn) => {
    await repos.empresas.setActive(id, activo, {}, conn);
    if (!activo) {
      const users = await db.query('SELECT ID FROM USUARIOS WHERE EMPRESA_ID = :id', { id }, conn);
      await db.execute('UPDATE USUARIOS SET ACTIVO = 0 WHERE EMPRESA_ID = :id', { id }, conn);
      for (const u of users) await auth.revokeAllForUser(u.id, conn);
    }
    await recordState(conn, { entidad: 'EMPRESA', entidadId: id, empresaId: id, anterior: activo ? 'INACTIVA' : 'ACTIVA', nuevo: activo ? 'ACTIVA' : 'INACTIVA', usuarioId: ctx.user.id });
    await audit(ctx, activo ? 'ACTIVAR' : 'DESACTIVAR', 'EMPRESA', id, null, conn);
  });
  return empresas.get(ctx.user, id);
};

/** Sede/contacto: la empresa debe existir; la sede del contacto debe pertenecer a la misma empresa. */
async function checkParent(user, data, current) {
  const empresaId = data.empresa_id ?? current?.empresa_id;
  if (!empresaId) throw badRequest('empresa_id es obligatorio');
  const emp = await repos.empresas.findById(empresaId);
  if (!emp) throw notFound('Empresa');
  if (data.sede_id) {
    const sede = await repos.sedes.findById(data.sede_id);
    if (!sede || sede.empresa_id !== empresaId) throw badRequest('La sede no pertenece a la empresa indicada');
  }
  return data;
}

const sedes = createCrudService({ repo: repos.sedes, entity: 'SEDE', label: 'Sede', beforeWrite: checkParent });
const contactos = createCrudService({ repo: repos.contactos, entity: 'CONTACTO', label: 'Contacto', beforeWrite: checkParent });

module.exports = { empresas, sedes, contactos };
