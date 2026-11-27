const { badRequest } = require('./errors');
const { r2 } = require('./totals');

/**
 * Calcula el descuento de una promoción sobre las líneas de una cotización (lógica pura; todo se decide en el servidor).
 * promo: { tipo_descuento, valor_descuento, valor_minimo }
 * serviceIds: servicios a los que aplica la promoción (vacío = todos)
 */
function computePromoDiscount(promo, lineas, serviceIds = []) {
  const subtotal = r2(lineas.reduce((a, l) => a + Number(l.total_linea ?? Number(l.cantidad) * Number(l.precio_unitario)), 0));
  const set = new Set(serviceIds.map(Number));
  const eligible = set.size
    ? r2(lineas.filter((l) => set.has(Number(l.servicio_id))).reduce((a, l) => a + Number(l.total_linea ?? Number(l.cantidad) * Number(l.precio_unitario)), 0))
    : subtotal;
  if (eligible <= 0) throw badRequest('La promoción no aplica a los servicios de esta cotización');
  if (subtotal < Number(promo.valor_minimo || 0)) throw badRequest('La cotización no alcanza el valor mínimo de la promoción');
  const raw = promo.tipo_descuento === 'VALOR' ? Math.min(Number(promo.valor_descuento), eligible) : (eligible * Number(promo.valor_descuento)) / 100;
  const descuento = Math.min(r2(raw), subtotal);
  return { descuento, subtotal, elegible: eligible };
}

const startOfToday = () => new Date(new Date().toDateString());
/** La promoción está activa y dentro de su vigencia (fechas inclusivas). */
function isPromoOpen(promo, today = startOfToday()) {
  if (!Number(promo.activa)) return false;
  const ini = new Date(promo.fecha_inicio); ini.setHours(0, 0, 0, 0);
  const fin = new Date(promo.fecha_fin); fin.setHours(0, 0, 0, 0);
  return today >= ini && today <= fin;
}

module.exports = { computePromoDiscount, isPromoOpen };
