const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../config/db');
const { badRequest, forbidden, notFound } = require('../../core/errors');
const { audit } = require('../../core/audit');
const { authenticate } = require('../../middleware/auth');
const { uploadMany, verifyFiles, safeName, UPLOAD_ROOT } = require('../../middleware/upload');
const { asyncHandler, ctxOf } = require('../../core/http');

const OWNERS = {
  SOLICITUD: 'SELECT ID, EMPRESA_ID, TECNICO_ID, ESTADO FROM SOLICITUDES WHERE ID = :id',
  ORDEN: 'SELECT ID, EMPRESA_ID, TECNICO_ID, ESTADO FROM ORDENES_SERVICIO WHERE ID = :id',
};

/** Resuelve la entidad dueña y valida que el usuario autenticado pueda leerla/escribirla. */
async function resolveOwner(user, entidad, entidadId, write) {
  if (!OWNERS[entidad]) throw badRequest('Entidad no válida');
  const o = await db.queryOne(OWNERS[entidad], { id: entidadId });
  if (!o) throw notFound('Registro');
  if (user.isStaff) return o;
  if (user.isClient) {
    if (o.empresa_id !== user.empresaId) throw notFound('Registro'); // no revelar existencia
    if (write && entidad !== 'SOLICITUD') throw forbidden();
    if (write && ['CERRADA', 'CANCELADA'].includes(o.estado)) throw badRequest('La solicitud ya está finalizada');
    return o;
  }
  if (user.isTecnicoOnly) {
    if (o.tecnico_id !== user.id) throw notFound('Registro');
    if (write && entidad === 'SOLICITUD') throw forbidden();
    return o;
  }
  throw forbidden();
}

const router = express.Router();
router.use(authenticate);

router.get('/:id/descargar', asyncHandler(async (req, res) => {
  const a = await db.queryOne('SELECT * FROM ADJUNTOS WHERE ID = :id AND ACTIVO = 1', { id: Number(req.params.id) });
  if (!a) throw notFound('Archivo');
  await resolveOwner(req.user, a.entidad, a.entidad_id, false);
  const full = path.resolve(UPLOAD_ROOT, a.nombre_archivo);
  if (!full.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(full)) throw notFound('Archivo');
  res.setHeader('Content-Type', a.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nombre_original)}`);
  fs.createReadStream(full).pipe(res);
}));

router.get('/:entidad/:entidadId', asyncHandler(async (req, res) => {
  const entidad = req.params.entidad.toUpperCase();
  const eid = Number(req.params.entidadId);
  await resolveOwner(req.user, entidad, eid, false);
  res.json(await db.query(`SELECT ID, TIPO, NOMBRE_ORIGINAL, MIME, TAMANO, CREADO_EN FROM ADJUNTOS WHERE ENTIDAD = :e AND ENTIDAD_ID = :id AND ACTIVO = 1 ORDER BY ID`, { e: entidad, id: eid }));
}));

router.post('/:entidad/:entidadId', uploadMany, asyncHandler(async (req, res) => {
  const files = req.files || [];
  try {
    const entidad = req.params.entidad.toUpperCase();
    const eid = Number(req.params.entidadId);
    if (!files.length) throw badRequest('No se recibieron archivos');
    const owner = await resolveOwner(req.user, entidad, eid, true);
    verifyFiles(files);
    const tipo = req.query.tipo === 'EVIDENCIA' && entidad === 'ORDEN' ? 'EVIDENCIA' : 'ADJUNTO';
    if (entidad === 'ORDEN' && !req.user.isStaff && owner.estado !== 'EN_EJECUCION') throw badRequest('Solo se cargan evidencias con la orden en ejecución');
    await db.withTransaction(async (conn) => {
      for (const f of files) {
        await db.execute(
          `INSERT INTO ADJUNTOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, TIPO, NOMBRE_ORIGINAL, NOMBRE_ARCHIVO, MIME, TAMANO, SUBIDO_POR)
           VALUES (:e, :eid, :emp, :t, :n, :a, :m, :s, :u)`,
          { e: entidad, eid, emp: owner.empresa_id, t: tipo, n: safeName(f.originalname), a: path.join(path.basename(path.dirname(f.path)), f.filename), m: f.mimetype, s: f.size, u: req.user.id }, conn);
      }
      await audit(ctxOf(req), 'SUBIR_ARCHIVO', entidad, eid, { cantidad: files.length }, conn);
    });
    res.status(201).json(await db.query(`SELECT ID, TIPO, NOMBRE_ORIGINAL, MIME, TAMANO, CREADO_EN FROM ADJUNTOS WHERE ENTIDAD = :e AND ENTIDAD_ID = :id AND ACTIVO = 1 ORDER BY ID`, { e: entidad, id: eid }));
  } catch (err) {
    files.forEach((f) => fs.unlink(f.path, () => {})); // no dejar archivos huérfanos si algo falla
    throw err;
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const a = await db.queryOne('SELECT * FROM ADJUNTOS WHERE ID = :id AND ACTIVO = 1', { id: Number(req.params.id) });
  if (!a) throw notFound('Archivo');
  await resolveOwner(req.user, a.entidad, a.entidad_id, true);
  if (!req.user.isStaff && a.subido_por !== req.user.id) throw forbidden('Solo puede eliminar los archivos que usted subió');
  await db.withTransaction(async (conn) => {
    await db.execute('UPDATE ADJUNTOS SET ACTIVO = 0 WHERE ID = :id', { id: a.id }, conn); // baja lógica: se conserva el registro
    await audit(ctxOf(req), 'ELIMINAR_ARCHIVO', a.entidad, a.entidad_id, { adjunto: a.id }, conn);
  });
  res.status(204).end();
}));

module.exports = { router, resolveOwner };
