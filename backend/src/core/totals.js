const { badRequest } = require('./errors');
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Calcula totales de una cotización en el servidor (el cliente nunca decide los montos). */
function calcularTotales(items, ivaPorcentaje = 19, descuento = 0) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('La cotización necesita al menos un concepto');
  const lineas = items.map((i) => ({ ...i, total_linea: r2(Number(i.cantidad) * Number(i.precio_unitario)) }));
  const subtotal = r2(lineas.reduce((a, l) => a + l.total_linea, 0));
  if (descuento < 0 || descuento > subtotal) throw badRequest('El descuento no puede ser negativo ni superar el subtotal');
  const base = r2(subtotal - descuento);
  const iva_valor = r2((base * ivaPorcentaje) / 100);
  return { lineas, subtotal, descuento: r2(descuento), iva_porcentaje: ivaPorcentaje, iva_valor, total: r2(base + iva_valor) };
}
module.exports = { calcularTotales, r2 };
