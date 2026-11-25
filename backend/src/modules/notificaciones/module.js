const express = require('express');
const db = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../core/http');

const router = express.Router();
router.use(authenticate);

// Solo las del usuario autenticado
router.get('/', asyncHandler(async (req, res) => {
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 20));
  const soloNoLeidas = req.query.noLeidas === 'true';
  const data = await db.query(
    `SELECT ID, TIPO, TITULO, MENSAJE, ENLACE, LEIDA, CREADO_EN FROM NOTIFICACIONES WHERE USUARIO_ID = :u ${soloNoLeidas ? 'AND LEIDA = 0' : ''} ORDER BY ID DESC FETCH FIRST :n ROWS ONLY`, { u: req.user.id, n: size });
  const { n } = await db.queryOne('SELECT COUNT(*) AS N FROM NOTIFICACIONES WHERE USUARIO_ID = :u AND LEIDA = 0', { u: req.user.id });
  res.json({ data, noLeidas: n });
}));
router.post('/:id/leer', asyncHandler(async (req, res) => {
  await db.execute('UPDATE NOTIFICACIONES SET LEIDA = 1 WHERE ID = :id AND USUARIO_ID = :u', { id: Number(req.params.id), u: req.user.id });
  res.status(204).end();
}));
router.post('/leer-todas', asyncHandler(async (req, res) => {
  await db.execute('UPDATE NOTIFICACIONES SET LEIDA = 1 WHERE USUARIO_ID = :u AND LEIDA = 0', { u: req.user.id });
  res.status(204).end();
}));
module.exports = { router };
