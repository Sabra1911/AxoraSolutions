const express = require('express');
const { createRepository } = require('../../core/repository');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler } = require('../../core/http');

const repo = createRepository({
  table: 'HISTORIAL_ESTADOS', alias: 'H', columns: [], readOnlyColumns: ['entidad', 'entidad_id', 'empresa_id', 'equipo_id', 'fecha'], hasUpdatedAt: false,
  filters: ['empresa_id', 'equipo_id', 'entidad', 'entidad_id'], dateRangeColumn: 'fecha', orderBy: 'H.FECHA DESC, H.ID DESC', empresaColumn: 'empresa_id',
  joins: 'LEFT JOIN USUARIOS U ON U.ID = H.USUARIO_ID LEFT JOIN EQUIPOS Q ON Q.ID = H.EQUIPO_ID',
  selectExtra: `U.NOMBRE AS USUARIO_NOMBRE, Q.NOMBRE AS EQUIPO_NOMBRE,
    CASE H.ENTIDAD WHEN 'SOLICITUD' THEN (SELECT X.CODIGO FROM SOLICITUDES X WHERE X.ID = H.ENTIDAD_ID)
                   WHEN 'COTIZACION' THEN (SELECT X.CODIGO FROM COTIZACIONES X WHERE X.ID = H.ENTIDAD_ID)
                   WHEN 'ORDEN' THEN (SELECT X.CODIGO FROM ORDENES_SERVICIO X WHERE X.ID = H.ENTIDAD_ID)
                   WHEN 'MANTENIMIENTO' THEN (SELECT X.CODIGO FROM MANTENIMIENTOS X WHERE X.ID = H.ENTIDAD_ID) END AS ENTIDAD_CODIGO`,
});

const router = express.Router();
// Un CLIENTE queda restringido por scope a su empresa; no ve borradores de cotización.
router.get('/', requirePerm('historial:read'), asyncHandler(async (req, res) => {
  const r = await repo.list(req.query, repo.scopeFor(req.user));
  if (req.user.isClient) r.data = r.data.filter((h) => !(h.entidad === 'COTIZACION' && h.estado_nuevo === 'BORRADOR'));
  res.json(r);
}));
module.exports = { router, repo };
