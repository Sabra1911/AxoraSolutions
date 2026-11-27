export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString('es-CO') : '—');
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtMoney = (v: any) => (v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v)));
export const label = (v: any) => (v ? String(v).replace(/_/g, ' ') : '—');
export const toDateInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '');
export const errMsg = (e: any): string => {
  const er = e?.error?.error;
  if (er?.details?.length) return er.details.map((d: any) => `${d.campo ? d.campo + ': ' : ''}${d.mensaje}`).join(' · ');
  return er?.message || (e?.status === 0 ? 'No hay conexión con el servidor' : 'Ocurrió un error inesperado');
};
