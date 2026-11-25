/** Interpreta 'YYYY-MM-DD' como fecha LOCAL (evita el corrimiento de un día por zona horaria al guardar en columnas DATE). */
function parseLocalDate(v) {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(v);
}
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
module.exports = { parseLocalDate, startOfToday };
