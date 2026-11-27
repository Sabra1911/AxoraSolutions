const { badRequest } = require('./errors');

const SOLICITUD = {
  NUEVA: ['EN_REVISION', 'COTIZADA', 'AUTORIZADA', 'CANCELADA'],
  EN_REVISION: ['COTIZADA', 'AUTORIZADA', 'CANCELADA'],
  COTIZADA: ['EN_REVISION', 'AUTORIZADA', 'CANCELADA'],
  AUTORIZADA: ['EN_PROCESO', 'CANCELADA'],
  EN_PROCESO: ['RESUELTA', 'CANCELADA'],
  RESUELTA: ['EN_PROCESO', 'CERRADA'],
  CERRADA: [],
  CANCELADA: [],
};
const COTIZACION = {
  BORRADOR: ['ENVIADA', 'ANULADA'],
  ENVIADA: ['APROBADA', 'RECHAZADA', 'VENCIDA', 'ANULADA'],
  APROBADA: [], RECHAZADA: [], VENCIDA: [], ANULADA: [],
};
const ORDEN = {
  PENDIENTE: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA: ['ASIGNADA', 'EN_EJECUCION', 'CANCELADA'],
  EN_EJECUCION: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: ['CERRADA', 'EN_EJECUCION'],
  CERRADA: [], CANCELADA: [],
};
const MANTENIMIENTO = {
  PROGRAMADO: ['EN_EJECUCION', 'CANCELADO'],
  EN_EJECUCION: ['COMPLETADO', 'CANCELADO'],
  COMPLETADO: [], CANCELADO: [],
};

function assertTransition(map, from, to, label = 'estado') {
  if (!map[from] || !map[from].includes(to)) {
    throw badRequest(`Transición de ${label} no permitida: ${from} → ${to}`);
  }
}
const canTransition = (map, from, to) => !!(map[from] && map[from].includes(to));

module.exports = { SOLICITUD, COTIZACION, ORDEN, MANTENIMIENTO, assertTransition, canTransition };
