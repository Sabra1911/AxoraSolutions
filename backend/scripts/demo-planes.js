/* Planes de mantenimiento y empresas "registradas" con sus contratos (SOLO DEMOSTRACIÓN).
 * Lo invoca seed-demo.js. Es idempotente: se identifica por código de plan / NIT / observaciones.
 * Todos los precios y empresas son FICTICIOS. Las empresas están en DEMO_COMPANIES de reset-demo.js. */
const db = require('../src/config/db');
const { ensureEquipos, ensureMaintenance } = require('./demo-data');

const idOut = () => ({ dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER });

/** Planes adicionales (BASICO y PREMIUM los crean seed-demo.js / demo-data.js). Cada plan agrupa varios servicios del catálogo. */
const PLANES = [
  { codigo: 'PLAN-SOPORTE', nombre: 'Plan Soporte de Equipos', descripcion: 'Mantenimiento preventivo y soporte de computadores y portátiles',
    alcance: 'Hasta 8 equipos, 1 visita mensual y soporte remoto prioritario', precio: 180000, visitas: 1, servicios: ['SOP-001', 'SOP-002', 'SOP-004', 'SOP-005', 'SOP-008'] },
  { codigo: 'PLAN-REDES', nombre: 'Plan Redes y Conectividad', descripcion: 'Revisión y mantenimiento de la red de la empresa',
    alcance: 'Revisión de WiFi, switches y cableado, 1 visita mensual', precio: 250000, visitas: 1, servicios: ['RED-001', 'RED-002', 'RED-003', 'RED-004'] },
  { codigo: 'PLAN-CCTV', nombre: 'Plan Vigilancia CCTV', descripcion: 'Mantenimiento de cámaras y grabadores de seguridad',
    alcance: 'Limpieza, enfoque y verificación de grabación, 1 visita mensual', precio: 300000, visitas: 1, servicios: ['CCT-001', 'CCT-002', 'CCT-003', 'CCT-004'] },
  { codigo: 'PLAN-IMPRESION', nombre: 'Plan Impresoras y Periféricos', descripcion: 'Mantenimiento de impresoras, teléfonos y periféricos',
    alcance: 'Lavado de cabezal, revisión de mecanismo y periféricos, 1 visita mensual', precio: 120000, visitas: 1, servicios: ['SOP-006', 'SOP-007', 'SOP-009'] },
];

/** Empresas que "se registraron" en la plataforma (ficticias, de Cúcuta y su área metropolitana). */
const PLAN_COMPANIES = [
  { nit: 'DEMO-NIT-007', razon: 'Panadería Demo La Espiga S.A.S.', comercial: 'Panadería Demo La Espiga', sector: 'Alimentos · DEMO', slug: 'espiga' },
  { nit: 'DEMO-NIT-008', razon: 'Colegio Demo San Martín S.A.S.', comercial: 'Colegio Demo San Martín', sector: 'Educación · DEMO', slug: 'colegio' },
  { nit: 'DEMO-NIT-009', razon: 'Ferretería Demo El Tornillo S.A.S.', comercial: 'Ferretería Demo El Tornillo', sector: 'Comercio · DEMO', slug: 'ferreteria' },
  { nit: 'DEMO-NIT-010', razon: 'Droguería Demo Salud Fácil S.A.S.', comercial: 'Droguería Demo Salud Fácil', sector: 'Salud · DEMO', slug: 'drogueria' },
  { nit: 'DEMO-NIT-011', razon: 'Hotel Demo Villa Real S.A.S.', comercial: 'Hotel Demo Villa Real', sector: 'Hotelería · DEMO', slug: 'hotel' },
  { nit: 'DEMO-NIT-012', razon: 'Consultorio Demo Sonrisa S.A.S.', comercial: 'Consultorio Odontológico Demo Sonrisa', sector: 'Salud · DEMO', slug: 'sonrisa' },
  { nit: 'DEMO-NIT-013', razon: 'Despacho Contable Demo Cuentas Claras S.A.S.', comercial: 'Despacho Contable Demo Cuentas Claras', sector: 'Servicios · DEMO', slug: 'contable' },
].map((c) => ({
  ...c, direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta', correo: `contacto.${c.slug}@demo.invalid`, contacto: `Contacto DEMO ${c.comercial}`,
  usuario: `cliente.${c.slug}@demo.invalid`, nombreUsuario: `Cliente DEMO ${c.comercial}`,
}));

/** [clave de empresa, plan, estado, inicio (días atrás), fin (días adelante)]. Claves: base, n, a, b, s, h = empresas ya existentes; el resto = PLAN_COMPANIES[slug]. */
const CONTRATOS = [
  ['base', 'PLAN-CCTV', 'VIGENTE', 45, 320], ['a', 'PLAN-REDES', 'VIGENTE', 30, 335], ['n', 'PLAN-SOPORTE', 'VIGENTE', 90, 275], ['b', 'PLAN-REDES', 'VIGENTE', 70, 295],
  ['b', 'PLAN-CCTV', 'VIGENTE', 70, 295], ['s', 'PLAN-IMPRESION', 'VIGENTE', 20, 345],
  ['espiga', 'PLAN-SOPORTE', 'VIGENTE', 60, 305], ['espiga', 'PLAN-IMPRESION', 'VIGENTE', 60, 305],
  ['colegio', 'PLAN-REDES', 'VIGENTE', 100, 265], ['colegio', 'PLAN-CCTV', 'VIGENTE', 100, 265], ['colegio', 'PLAN-SOPORTE', 'VIGENTE', 100, 265],
  ['ferreteria', 'PLAN-BASICO', 'VIGENTE', 40, 325], ['drogueria', 'PLAN-CCTV', 'VIGENTE', 15, 350], ['hotel', 'PLAN-PREMIUM', 'VIGENTE', 80, 285],
  ['hotel', 'PLAN-IMPRESION', 'VIGENTE', 80, 285], ['sonrisa', 'PLAN-SOPORTE', 'SUSPENDIDO', 200, 165], ['contable', 'PLAN-BASICO', 'VIGENTE', 25, 340],
  ['contable', 'PLAN-REDES', 'VENCIDO', 420, -55],
];

async function ensurePlan(conn, p) {
  let plan = await db.queryOne('SELECT ID FROM PLANES WHERE CODIGO = :c', { c: p.codigo }, conn);
  if (plan) return plan.id;
  const r = await db.execute(
    `INSERT INTO PLANES (CODIGO, NOMBRE, DESCRIPCION, ALCANCE, PRECIO_MENSUAL, VISITAS_MES) VALUES (:c, :n, :d, :a, :p, :v) RETURNING ID INTO :id`,
    { c: p.codigo, n: p.nombre, d: p.descripcion, a: p.alcance, p: p.precio, v: p.visitas, id: idOut() }, conn);
  const pid = r.outBinds.id[0];
  for (const code of p.servicios) {
    await db.execute('INSERT INTO PLAN_SERVICIO (PLAN_ID, SERVICIO_ID) SELECT :p, ID FROM SERVICIOS WHERE CODIGO = :c', { p: pid, c: code }, conn);
  }
  return pid;
}

async function ensureContrato(conn, empresaId, planCodigo, estado, inicio, fin) {
  const plan = await db.queryOne('SELECT ID, PRECIO_MENSUAL FROM PLANES WHERE CODIGO = :c', { c: planCodigo }, conn);
  if (!plan) return null;
  const obs = `DEMO · ${planCodigo}`;
  const ex = await db.queryOne('SELECT ID FROM CONTRATOS WHERE EMPRESA_ID = :e AND PLAN_ID = :p AND OBSERVACIONES = :o', { e: empresaId, p: plan.id, o: obs }, conn);
  if (ex) return ex.id;
  const r = await db.execute(
    `INSERT INTO CONTRATOS (EMPRESA_ID, PLAN_ID, FECHA_INICIO, FECHA_FIN, PRECIO_MENSUAL, ESTADO, OBSERVACIONES)
     VALUES (:e, :p, TRUNC(SYSDATE) - :i, TRUNC(SYSDATE) + :f, :pr, :es, :o) RETURNING ID INTO :id`,
    { e: empresaId, p: plan.id, i: inicio, f: fin, pr: plan.precio_mensual, es: estado, o: obs, id: idOut() }, conn);
  return r.outBinds.id[0];
}

/**
 * ctx: { ensureDemoCompany, upsertUser, hash, superadminId, tecnicoId, tecnico2Id, base:{id,sedeId}, companies:[{id,sedeId}] (orden n,a,b,s,h) }
 * Devuelve un resumen { planes, empresas, contratos } para el mensaje final del seed.
 */
async function seedPlansAndClients(conn, ctx) {
  for (const p of PLANES) await ensurePlan(conn, p);

  const byKey = { base: { ...ctx.base }, n: ctx.companies[0], a: ctx.companies[1], b: ctx.companies[2], s: ctx.companies[3], h: ctx.companies[4] };
  for (const company of PLAN_COMPANIES) {
    const created = await ctx.ensureDemoCompany(conn, company);
    await ctx.upsertUser(conn, { email: company.usuario, nombre: company.nombreUsuario, rol: 'CLIENTE', empresaId: created.id, hash: ctx.hash });
    // Segundo usuario de la misma empresa (p. ej. quien administra las compras o la sede), para probar varios accesos por cliente
    await ctx.upsertUser(conn, { email: `compras.${company.slug}@demo.invalid`, nombre: `Compras DEMO ${company.comercial}`, rol: 'CLIENTE', empresaId: created.id, hash: ctx.hash });
    byKey[company.slug] = created;
  }

  let contratos = 0;
  const contractIds = {};
  for (const [key, plan, estado, inicio, fin] of CONTRATOS) {
    const emp = byKey[key];
    if (!emp) continue;
    const id = await ensureContrato(conn, emp.id, plan, estado, inicio, fin);
    if (id) { contratos += 1; contractIds[`${key}:${plan}`] = id; }
  }

  // Un equipo y un mantenimiento preventivo programado por cada empresa nueva con contrato vigente
  let i = 0;
  for (const company of PLAN_COMPANIES) {
    const emp = byKey[company.slug];
    const first = CONTRATOS.find((c) => c[0] === company.slug && c[2] === 'VIGENTE');
    if (!first) continue;
    const eq = await ensureEquipos(conn, emp.id, emp.sedeId, [['COMPUTADOR', 'PC Administración', 'HP', 'ProDesk 400', 'OPERATIVO', 'Administración']]);
    await ensureMaintenance(conn, { id: emp.id, sedeId: emp.sedeId, staffId: ctx.superadminId }, {
      titulo: `DEMO · Preventivo del plan ${first[1].replace('PLAN-', '')}`, tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: 4 + (i % 6) * 5, frecuencia: 30,
      equipoId: eq['PC Administración'], tecnicoId: i % 2 ? ctx.tecnico2Id : ctx.tecnicoId, contratoId: contractIds[`${company.slug}:${first[1]}`],
      descripcion: 'Visita preventiva incluida en el plan contratado: limpieza, revisión y actualizaciones.',
    });
    i += 1;
  }
  return { planes: PLANES.length + 2, empresas: PLAN_COMPANIES.length, contratos };
}

module.exports = { seedPlansAndClients, PLAN_COMPANIES, PLANES, CONTRATOS };
