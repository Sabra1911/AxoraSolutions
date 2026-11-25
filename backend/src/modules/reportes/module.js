const express = require('express');
const db = require('../../config/db');
const { requirePerm } = require('../../middleware/auth');
const { asyncHandler } = require('../../core/http');

const { parseLocalDate } = require('../../core/dates');
const DAY = 86400000;

/** Construye filtros parametrizados. El filtro por empresa de un CLIENTE sale de su identidad, nunca de la query. */
function filters(user, q, { alias, dateCol, empresaCol = 'EMPRESA_ID', extra = {} }) {
  const where = [];
  const binds = {};
  const empresaId = user.isClient ? user.empresaId : q.empresa_id;
  if (user.isClient && !empresaId) where.push('1 = 0');
  if (empresaId) { where.push(`${alias}.${empresaCol} = :empresa`); binds.empresa = Number(empresaId); }
  if (q.desde && !Number.isNaN(Date.parse(q.desde))) { where.push(`${alias}.${dateCol} >= :desde`); binds.desde = parseLocalDate(q.desde); }
  if (q.hasta && !Number.isNaN(Date.parse(q.hasta))) { where.push(`${alias}.${dateCol} < :hasta`); binds.hasta = new Date(parseLocalDate(q.hasta).getTime() + DAY); }
  for (const [param, col] of Object.entries(extra)) {
    if (q[param]) { where.push(`${alias}.${col} = :${param}`); binds[param] = q[param]; }
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}
const and = (sql, cond) => (sql ? `${sql} AND ${cond}` : `WHERE ${cond}`);

async function dashboard(user, q) {
  const sol = filters(user, q, { alias: 'S', dateCol: 'CREADO_EN', extra: { estado: 'ESTADO', servicio_id: 'SERVICIO_ID' } });
  const cot = filters(user, q, { alias: 'C', dateCol: 'FECHA_EMISION', extra: { } });
  const ord = filters(user, q, { alias: 'O', dateCol: 'CREADO_EN', extra: { servicio_id: 'SERVICIO_ID' } });
  const mto = filters(user, q, { alias: 'M', dateCol: 'FECHA_PROGRAMADA' });
  const clientHidden = user.isClient ? "C.ESTADO <> 'BORRADOR'" : null;
  const cotWhere = clientHidden ? and(cot.sql, clientHidden) : cot.sql;

  const [solPorEstado, solPorMes, solPorServicio, cotPorEstado, ingresosPorMes, ordPorEstado, mtoProx, mtoCnt] = await Promise.all([
    db.query(`SELECT S.ESTADO, COUNT(*) AS TOTAL FROM SOLICITUDES S ${sol.sql} GROUP BY S.ESTADO`, sol.binds),
    db.query(`SELECT TO_CHAR(TRUNC(S.CREADO_EN, 'MM'), 'YYYY-MM') AS MES, COUNT(*) AS TOTAL FROM SOLICITUDES S ${sol.sql} GROUP BY TRUNC(S.CREADO_EN, 'MM') ORDER BY 1`, sol.binds),
    db.query(`SELECT NVL(SV.NOMBRE, 'Sin servicio') AS SERVICIO, COUNT(*) AS TOTAL FROM SOLICITUDES S LEFT JOIN SERVICIOS SV ON SV.ID = S.SERVICIO_ID ${sol.sql} GROUP BY NVL(SV.NOMBRE, 'Sin servicio') ORDER BY 2 DESC FETCH FIRST 5 ROWS ONLY`, sol.binds),
    db.query(`SELECT C.ESTADO, COUNT(*) AS TOTAL, NVL(SUM(C.TOTAL), 0) AS VALOR FROM COTIZACIONES C ${cotWhere} GROUP BY C.ESTADO`, cot.binds),
    db.query(`SELECT TO_CHAR(TRUNC(C.FECHA_EMISION, 'MM'), 'YYYY-MM') AS MES, SUM(C.TOTAL) AS VALOR FROM COTIZACIONES C ${and(cot.sql, "C.ESTADO = 'APROBADA'")} GROUP BY TRUNC(C.FECHA_EMISION, 'MM') ORDER BY 1`, cot.binds),
    db.query(`SELECT O.ESTADO, COUNT(*) AS TOTAL FROM ORDENES_SERVICIO O ${ord.sql} GROUP BY O.ESTADO`, ord.binds),
    db.query(`SELECT M.ID, M.CODIGO, M.TITULO, M.TIPO, M.FECHA_PROGRAMADA, M.ESTADO, E.RAZON_SOCIAL AS EMPRESA_NOMBRE FROM MANTENIMIENTOS M JOIN EMPRESAS E ON E.ID = M.EMPRESA_ID
               ${and(mto.sql, "M.ESTADO = 'PROGRAMADO' AND M.FECHA_PROGRAMADA <= TRUNC(SYSDATE) + 30")} ORDER BY M.FECHA_PROGRAMADA FETCH FIRST 8 ROWS ONLY`, mto.binds),
    db.queryOne(`SELECT COUNT(CASE WHEN M.ESTADO = 'PROGRAMADO' AND M.FECHA_PROGRAMADA < TRUNC(SYSDATE) THEN 1 END) AS VENCIDOS,
                        COUNT(CASE WHEN M.ESTADO = 'PROGRAMADO' THEN 1 END) AS PROGRAMADOS FROM MANTENIMIENTOS M ${mto.sql}`, mto.binds),
  ]);

  const out = { solicitudesPorEstado: solPorEstado, solicitudesPorMes: solPorMes, serviciosMasSolicitados: solPorServicio, cotizacionesPorEstado: cotPorEstado, ingresosAprobadosPorMes: ingresosPorMes, ordenesPorEstado: ordPorEstado, mantenimientosProximos: mtoProx, mantenimientos: mtoCnt };
  if (user.isStaff) {
    const [kpi, porTecnico] = await Promise.all([
      db.queryOne(`SELECT (SELECT COUNT(*) FROM EMPRESAS WHERE ACTIVO = 1) AS EMPRESAS_ACTIVAS, (SELECT COUNT(*) FROM EQUIPOS WHERE ACTIVO = 1) AS EQUIPOS_ACTIVOS,
                          (SELECT COUNT(*) FROM CONTRATOS WHERE ESTADO = 'VIGENTE') AS CONTRATOS_VIGENTES, (SELECT COUNT(*) FROM USUARIOS WHERE ACTIVO = 1) AS USUARIOS_ACTIVOS FROM DUAL`),
      db.query(`SELECT NVL(U.NOMBRE, 'Sin asignar') AS TECNICO, COUNT(*) AS TOTAL FROM ORDENES_SERVICIO O LEFT JOIN USUARIOS U ON U.ID = O.TECNICO_ID ${and(ord.sql, "O.ESTADO NOT IN ('CANCELADA')")} GROUP BY NVL(U.NOMBRE, 'Sin asignar') ORDER BY 2 DESC FETCH FIRST 8 ROWS ONLY`, ord.binds),
    ]);
    out.kpis = kpi;
    out.ordenesPorTecnico = porTecnico;
  } else if (user.isClient) {
    out.kpis = await db.queryOne(
      `SELECT (SELECT COUNT(*) FROM EQUIPOS WHERE EMPRESA_ID = :e AND ACTIVO = 1) AS EQUIPOS_ACTIVOS,
              (SELECT COUNT(*) FROM COTIZACIONES WHERE EMPRESA_ID = :e AND ESTADO = 'ENVIADA') AS COTIZACIONES_PENDIENTES,
              (SELECT COUNT(*) FROM SOLICITUDES WHERE EMPRESA_ID = :e AND ESTADO NOT IN ('CERRADA','CANCELADA')) AS SOLICITUDES_ABIERTAS FROM DUAL`, { e: user.empresaId });
  }
  return out;
}

const router = express.Router();
router.get('/dashboard', requirePerm('reportes:read'), asyncHandler(async (req, res) => res.json(await dashboard(req.user, req.query))));
module.exports = { router, filters };
