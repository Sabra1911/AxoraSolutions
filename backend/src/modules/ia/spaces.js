const express = require('express');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { badRequest, notFound } = require('../../core/errors');
const { z } = require('../../core/schemas');
const { requirePerm } = require('../../middleware/auth');
const { uploadSingle, verifyFiles, safeName } = require('../../middleware/upload');
const service = require('./space-service');

const router = express.Router();
const uploadLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const analysisLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const generationLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 4, standardHeaders: true, legacyHeaders: false });
const generationSchema = z.object({ confirmar_envio: z.literal(true) }).strict();
const imageId = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw badRequest('Identificador de propuesta inválido.');
  return parsed;
};

async function removeUpload(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[ia espacios] no se pudo limpiar una carga fallida:', error.message);
  }
}

function sendPrivateImage(res, next, file) {
  if (!fs.existsSync(file.path)) throw notFound('Imagen de propuesta');
  res.set({
    'Content-Type': file.mime,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="${safeName(file.name)}"`,
  });
  fs.createReadStream(file.path).on('error', next).pipe(res);
}

router.get('/catalogo', requirePerm('solicitudes:create'), asyncHandler(async (_req, res) => {
  res.json(await service.catalog());
}));

router.get('/', requirePerm('solicitudes:create'), asyncHandler(async (req, res) => {
  res.json(await service.list(req.user));
}));

router.post('/', uploadLimit, requirePerm('solicitudes:create'), uploadSingle, asyncHandler(async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw badRequest('Seleccione una fotografía para continuar.');
    verifyFiles([file]);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw badRequest('Solo se permiten fotografías JPG, PNG o WEBP.');
    }
    const proposal = await service.createDraft(ctxOf(req), file, req.body?.empresa_id);
    res.status(201).json(proposal);
  } catch (error) {
    await removeUpload(file);
    throw error;
  }
}));

router.get('/:id', requirePerm('solicitudes:create'), asyncHandler(async (req, res) => {
  res.json(await service.getDetail(req.user, imageId(req.params.id)));
}));

router.get('/:id/fotografia', requirePerm('solicitudes:create'), asyncHandler(async (req, res, next) => {
  sendPrivateImage(res, next, await service.imageFor(req.user, imageId(req.params.id)));
}));

router.get('/:id/versiones/:versionId/imagen', requirePerm('solicitudes:create'), asyncHandler(async (req, res, next) => {
  sendPrivateImage(res, next, await service.imageFor(
    req.user,
    imageId(req.params.id),
    imageId(req.params.versionId),
  ));
}));

router.post('/:id/analizar', analysisLimit, requirePerm('solicitudes:create'), validate(service.analyzeSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.analyzeProposal(ctxOf(req), imageId(req.params.id), req.valid));
  }));

/** Modo manual: guarda servicios y descripción sin llamar a la IA (para cuando no está configurada o falla). */
router.post('/:id/manual', requirePerm('solicitudes:create'), validate(service.manualSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.saveManual(ctxOf(req), imageId(req.params.id), req.valid));
  }));

router.post('/:id/versiones', generationLimit, requirePerm('solicitudes:create'), validate(generationSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.generateVersion(ctxOf(req), imageId(req.params.id), req.valid.confirmar_envio));
  }));

router.post('/:id/cotizacion', requirePerm('solicitudes:create'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.createQuote(ctxOf(req), imageId(req.params.id)));
}));

router.delete('/:id', requirePerm('solicitudes:create'), asyncHandler(async (req, res) => {
  await service.deleteProposal(ctxOf(req), imageId(req.params.id));
  res.status(204).end();
}));

module.exports = { router };
