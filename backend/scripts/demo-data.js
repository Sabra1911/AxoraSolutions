/* Datos demo ampliados (SOLO PRUEBA). Lo invoca seed-demo.js dentro de su transacción.
 * Todo es idempotente: se identifica por empresa + asunto/título/nombre, así que repetir el seed no duplica.
 * Los registros llevan el prefijo "DEMO ·" y todas las empresas están en DEMO_COMPANIES de reset-demo.js,
 * por lo que `npm run db:demo:reset` los elimina. Fechas relativas a hoy (SYSDATE) para que el dashboard se vea vivo. */
const db = require('../src/config/db');

const EXTRA_COMPANIES = [
  {
    nit: 'DEMO-NIT-005', razon: 'Restaurante Demo El Sabor S.A.S.', comercial: 'Restaurante Demo El Sabor',
    sector: 'Gastronomía · DEMO', direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta',
    correo: 'contacto.sabor@demo.invalid', contacto: 'Contacto DEMO El Sabor',
    usuario: 'cliente.sabor@demo.invalid', nombreUsuario: 'Cliente DEMO El Sabor',
  },
  {
    nit: 'DEMO-NIT-006', razon: 'Clínica Demo Salud Integral S.A.S.', comercial: 'Clínica Demo Salud Integral',
    sector: 'Salud · DEMO', direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta',
    correo: 'contacto.salud@demo.invalid', contacto: 'Contacto DEMO Salud',
    usuario: 'cliente.salud@demo.invalid', nombreUsuario: 'Cliente DEMO Salud',
  },
];

// [tipo, nombre, marca, modelo, estado, ubicación]
const EQUIPOS = {
  base: [
    ['COMPUTADOR', 'PC Facturación', 'HP', 'ProDesk 400', 'OPERATIVO', 'Caja principal'],
    ['IMPRESORA', 'Impresora Bodega', 'Epson', 'L3250', 'EN_REPARACION', 'Bodega'],
    ['SWITCH', 'Switch Principal', 'TP-Link', 'TL-SG1024D', 'OPERATIVO', 'Cuarto técnico'],
    ['DVR_NVR', 'NVR 8 canales', 'Hikvision', 'DS-7608NI', 'OPERATIVO', 'Cuarto técnico'],
  ],
  0: [
    ['COMPUTADOR', 'PC Recepción', 'Dell', 'OptiPlex 3080', 'OPERATIVO', 'Recepción'],
    ['PORTATIL', 'Portátil Dirección', 'Lenovo', 'ThinkPad E14', 'OPERATIVO', 'Dirección'],
    ['CAMARA', 'Cámara Parqueadero', 'Dahua', 'IPC-HFW1230', 'FUERA_DE_SERVICIO', 'Parqueadero'],
    ['ACCESS_POINT', 'AP Sala de juntas', 'Ubiquiti', 'UniFi U6-Lite', 'OPERATIVO', 'Sala de juntas'],
  ],
  1: [
    ['COMPUTADOR', 'PC Caja 1', 'HP', 'EliteDesk 800', 'OPERATIVO', 'Caja 1'],
    ['COMPUTADOR', 'PC Caja 2', 'HP', 'EliteDesk 800', 'OPERATIVO', 'Caja 2'],
    ['ROUTER', 'Router Local', 'MikroTik', 'hAP ac2', 'OPERATIVO', 'Trastienda'],
    ['CAMARA', 'Cámara Salón de ventas', 'Hikvision', 'DS-2CD1023', 'OPERATIVO', 'Salón de ventas'],
  ],
  2: [
    ['SWITCH', 'Switch Bodega', 'Cisco', 'SG110-24', 'OPERATIVO', 'Bodega'],
    ['CAMARA', 'Cámara Muelle de carga', 'Hikvision', 'DS-2CD2043', 'OPERATIVO', 'Muelle'],
    ['DVR_NVR', 'DVR 16 canales', 'Dahua', 'XVR5116', 'EN_REPARACION', 'Oficina'],
  ],
  3: [
    ['COMPUTADOR', 'POS Cocina', 'Lenovo', 'ThinkCentre M70', 'OPERATIVO', 'Cocina'],
    ['IMPRESORA', 'Impresora de comandas', 'Epson', 'TM-T20III', 'EN_REPARACION', 'Cocina'],
    ['ROUTER', 'Router WiFi Comedor', 'TP-Link', 'Archer C6', 'OPERATIVO', 'Caja'],
  ],
  4: [
    ['COMPUTADOR', 'PC Admisiones', 'Dell', 'OptiPlex 7090', 'OPERATIVO', 'Admisiones'],
    ['COMPUTADOR', 'PC Consultorio 1', 'HP', 'ProDesk 600', 'OPERATIVO', 'Consultorio 1'],
    ['SWITCH', 'Switch Piso 2', 'TP-Link', 'TL-SG1016D', 'OPERATIVO', 'Piso 2'],
    ['CAMARA', 'Cámara Sala de espera', 'Dahua', 'IPC-HDW1230', 'OPERATIVO', 'Sala de espera'],
  ],
};

const idOut = () => ({ dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER });
const ago = (d) => `SYSTIMESTAMP - ${Math.max(0, Math.trunc(Number(d)) || 0)}`; // d es siempre un número literal definido aquí (no entrada de usuario)

async function ensureEquipos(conn, empresaId, sedeId, items) {
  const out = {};
  for (const [tipo, nombre, marca, modelo, estado, ubic] of items) {
    let row = await db.queryOne('SELECT ID FROM EQUIPOS WHERE EMPRESA_ID = :e AND NOMBRE = :n', { e: empresaId, n: nombre }, conn);
    if (!row) {
      const r = await db.execute(
        `INSERT INTO EQUIPOS (EMPRESA_ID, SEDE_ID, TIPO, NOMBRE, MARCA, MODELO, UBICACION, ESTADO, SERIAL, GARANTIA_HASTA)
         VALUES (:e, :s, :t, :n, :m, :mo, :u, :es, :ser, TRUNC(SYSDATE) + :g) RETURNING ID INTO :id`,
        { e: empresaId, s: sedeId, t: tipo, n: nombre, m: marca, mo: modelo, u: ubic, es: estado,
          ser: `DEMO-${String(empresaId).padStart(3, '0')}-${Math.abs(hash(nombre)) % 100000}`, g: (hash(nombre) % 400) - 100, id: idOut() }, conn);
      row = { id: r.outBinds.id[0] };
    }
    out[nombre] = row.id;
  }
  return out;
}
function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

async function history(conn, { entidad, id, empresaId, equipoId = null, anterior = null, nuevo, comentario, usuarioId, dias }) {
  await db.execute(
    `INSERT INTO HISTORIAL_ESTADOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, EQUIPO_ID, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO, USUARIO_ID, FECHA)
     VALUES (:en, :id, :emp, :eq, :ant, :nu, :com, :us, ${ago(dias)})`,
    { en: entidad, id, emp: empresaId, eq: equipoId, ant: anterior, nu: nuevo, com: comentario, us: usuarioId }, conn);
}

/** Solicitud sin cotización (nuevas, en revisión, canceladas). */
async function ensureRequest(conn, c, { asunto, descripcion, servicio, categoria, prioridad = 'MEDIA', estado, equipoId = null, dias }) {
  let row = await db.queryOne('SELECT ID FROM SOLICITUDES WHERE EMPRESA_ID = :e AND ASUNTO = :a', { e: c.id, a: asunto }, conn);
  if (row) return row.id;
  const sv = await db.queryOne('SELECT ID FROM SERVICIOS WHERE CODIGO = :c', { c: servicio }, conn);
  const r = await db.execute(
    `INSERT INTO SOLICITUDES (EMPRESA_ID, SEDE_ID, EQUIPO_ID, SERVICIO_ID, SOLICITANTE_ID, CATEGORIA, ASUNTO, DESCRIPCION, PRIORIDAD, ESTADO, CREADO_EN)
     VALUES (:e, :s, :eq, :sv, :cl, :cat, :a, :d, :p, :es, ${ago(dias)}) RETURNING ID INTO :id`,
    { e: c.id, s: c.sedeId, eq: equipoId, sv: sv?.id ?? null, cl: c.clientId, cat: categoria, a: asunto, d: descripcion, p: prioridad, es: estado, id: idOut() }, conn);
  const id = r.outBinds.id[0];
  await history(conn, { entidad: 'SOLICITUD', id, empresaId: c.id, equipoId, nuevo: 'NUEVA', comentario: 'Solicitud registrada (demo)', usuarioId: c.clientId, dias });
  if (estado !== 'NUEVA') {
    await history(conn, { entidad: 'SOLICITUD', id, empresaId: c.id, equipoId, anterior: 'NUEVA', nuevo: estado, comentario: 'Cambio de estado (demo)', usuarioId: c.staffId, dias: Math.max(dias - 1, 0) });
  }
  return id;
}

/** Orden en el estado pedido, con diagnóstico/solución, actividades y materiales cuando corresponde. */
async function ensureOrder(conn, c, o) {
  const ex = await db.queryOne('SELECT ID FROM ORDENES_SERVICIO WHERE COTIZACION_ID = :c', { c: o.cotizacionId }, conn);
  if (ex) return ex.id;
  const started = ['EN_EJECUCION', 'FINALIZADA', 'CERRADA'].includes(o.estado);
  const finished = ['FINALIZADA', 'CERRADA'].includes(o.estado);
  const r = await db.execute(
    `INSERT INTO ORDENES_SERVICIO (EMPRESA_ID, SEDE_ID, SOLICITUD_ID, COTIZACION_ID, EQUIPO_ID, SERVICIO_ID, TECNICO_ID, CREADO_POR, ESTADO, PRIORIDAD,
        DESCRIPCION_TRABAJO, DIAGNOSTICO, SOLUCION, FECHA_PROGRAMADA, FECHA_INICIO, FECHA_FIN, FECHA_CIERRE, CREADO_EN)
     VALUES (:e, :s, :sol, :cot, :eq, :sv, :t, :cp, :es, :pr, :dt, :dg, :so, TRUNC(SYSDATE) + :prog,
        ${started ? ago(o.dias - 1) : 'NULL'}, ${finished ? ago(o.dias - 2) : 'NULL'}, ${o.estado === 'CERRADA' ? ago(o.dias - 3) : 'NULL'}, ${ago(o.dias)})
     RETURNING ID INTO :id`,
    { e: c.id, s: c.sedeId, sol: o.solicitudId, cot: o.cotizacionId, eq: o.equipoId, sv: o.servicioId, t: o.tecnicoId, cp: c.staffId, es: o.estado, pr: o.prioridad || 'MEDIA',
      dt: o.trabajo, dg: started ? o.diagnostico : null, so: finished ? o.solucion : null, prog: o.progOffset ?? 0, id: idOut() }, conn);
  const id = r.outBinds.id[0];
  if (o.tecnicoId) await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('ORDEN', :o, :t, :a)`, { o: id, t: o.tecnicoId, a: c.staffId }, conn);
  const chain = ['PENDIENTE', 'ASIGNADA', 'EN_EJECUCION', 'FINALIZADA', 'CERRADA'];
  const upto = o.estado === 'CANCELADA' ? 1 : chain.indexOf(o.estado);
  for (let i = 0; i <= Math.max(upto, 0); i++) {
    await history(conn, { entidad: 'ORDEN', id, empresaId: c.id, equipoId: o.equipoId, anterior: i ? chain[i - 1] : null, nuevo: chain[i],
      comentario: 'Registro ficticio de demostración', usuarioId: i >= 2 ? o.tecnicoId : c.staffId, dias: Math.max(o.dias - i, 0) });
  }
  if (o.estado === 'CANCELADA') {
    await history(conn, { entidad: 'ORDEN', id, empresaId: c.id, equipoId: o.equipoId, anterior: 'ASIGNADA', nuevo: 'CANCELADA', comentario: 'Cancelada a pedido del cliente (demo)', usuarioId: c.staffId, dias: Math.max(o.dias - 2, 0) });
  }
  if (started && o.detalle) {
    for (const [tipo, desc, cant, costo] of o.detalle) {
      await db.execute(
        `INSERT INTO DETALLE_ORDEN (ORDEN_ID, TIPO, DESCRIPCION, CANTIDAD, COSTO_UNITARIO, REGISTRADO_POR) VALUES (:o, :t, :d, :c, :k, :u)`,
        { o: id, t: tipo, d: desc, c: cant, k: costo, u: o.tecnicoId }, conn);
    }
  }
  return id;
}

async function backdateQuote(conn, quoteId, dias, validezDias) {
  await db.execute(
    `UPDATE COTIZACIONES SET FECHA_EMISION = TRUNC(SYSDATE) - :d, VALIDEZ_HASTA = TRUNC(SYSDATE) - :d + :v, CREADO_EN = ${ago(dias)} WHERE ID = :id`,
    { d: dias, v: validezDias, id: quoteId }, conn);
}
async function backdateRequest(conn, requestId, dias) {
  await db.execute(`UPDATE SOLICITUDES SET CREADO_EN = ${ago(dias)} WHERE ID = :id`, { id: requestId }, conn);
}

async function ensureMaintenance(conn, c, m) {
  const ex = await db.queryOne('SELECT ID FROM MANTENIMIENTOS WHERE EMPRESA_ID = :e AND TITULO = :t', { e: c.id, t: m.titulo }, conn);
  if (ex) return ex.id;
  const done = m.estado === 'COMPLETADO';
  const r = await db.execute(
    `INSERT INTO MANTENIMIENTOS (EMPRESA_ID, SEDE_ID, EQUIPO_ID, CONTRATO_ID, TECNICO_ID, CREADO_POR, TIPO, TITULO, DESCRIPCION, ESTADO, FECHA_PROGRAMADA, FRECUENCIA_DIAS,
        FECHA_INICIO, FECHA_EJECUCION, RESULTADO, PROXIMO_VENCIMIENTO)
     VALUES (:e, :s, :eq, :ct, :t, :cp, :tipo, :ti, :de, :es, TRUNC(SYSDATE) + :f, :fr,
        ${m.estado === 'EN_EJECUCION' || done ? 'SYSTIMESTAMP' : 'NULL'}, ${done ? ago(Math.max(-m.offset, 0)) : 'NULL'}, :res,
        ${m.frecuencia ? 'TRUNC(SYSDATE) + :f + :fr' : 'NULL'}) RETURNING ID INTO :id`,
    { e: c.id, s: c.sedeId, eq: m.equipoId ?? null, ct: m.contratoId ?? null, t: m.tecnicoId, cp: c.staffId, tipo: m.tipo, ti: m.titulo, de: m.descripcion,
      es: m.estado, f: m.offset, fr: m.frecuencia ?? null, res: done ? m.resultado : null, id: idOut() }, conn);
  const id = r.outBinds.id[0];
  await history(conn, { entidad: 'MANTENIMIENTO', id, empresaId: c.id, equipoId: m.equipoId ?? null, nuevo: m.estado, comentario: 'Registro ficticio de demostración', usuarioId: c.staffId, dias: 1 });
  return id;
}

async function ensurePlanAndContract(conn, c, { planCodigo, observaciones, inicioDias, finDias, estado }) {
  const plan = await db.queryOne('SELECT ID, PRECIO_MENSUAL FROM PLANES WHERE CODIGO = :c', { c: planCodigo }, conn);
  if (!plan) return null;
  const ex = await db.queryOne('SELECT ID FROM CONTRATOS WHERE EMPRESA_ID = :e AND OBSERVACIONES = :o', { e: c.id, o: observaciones }, conn);
  if (ex) return ex.id;
  const r = await db.execute(
    `INSERT INTO CONTRATOS (EMPRESA_ID, PLAN_ID, FECHA_INICIO, FECHA_FIN, PRECIO_MENSUAL, ESTADO, OBSERVACIONES)
     VALUES (:e, :p, TRUNC(SYSDATE) - :i, TRUNC(SYSDATE) + :f, :pr, :es, :o) RETURNING ID INTO :id`,
    { e: c.id, p: plan.id, i: inicioDias, f: finDias, pr: plan.precio_mensual, es: estado, o: observaciones, id: idOut() }, conn);
  return r.outBinds.id[0];
}

async function ensureNotification(conn, userId, empresaId, n) {
  const ex = await db.queryOne('SELECT ID FROM NOTIFICACIONES WHERE USUARIO_ID = :u AND TITULO = :t', { u: userId, t: n.titulo }, conn);
  if (ex) return;
  await db.execute(
    `INSERT INTO NOTIFICACIONES (USUARIO_ID, EMPRESA_ID, TIPO, TITULO, MENSAJE, ENLACE, LEIDA, CREADO_EN) VALUES (:u, :e, :t, :ti, :m, :l, :le, ${ago(n.dias)})`,
    { u: userId, e: empresaId, t: n.tipo, ti: n.titulo, m: n.mensaje, l: n.enlace || null, le: n.leida ? 1 : 0 }, conn);
}

/**
 * ctx: { upsertUser, ensureDemoCompany, ensureDemoQuote, hash, domain, superadminId, adminId, tecnicoId, tecnico2Id,
 *        base: {id, sedeId, clientId}, companies: [{id, sedeId, clientId} x4 en orden DEMO_COMPANIES+EXTRA] }
 */
async function seedRichDemo(conn, ctx) {
  const { ensureDemoQuote, superadminId, adminId, tecnicoId, tecnico2Id } = ctx;
  const staffId = superadminId;
  const C = { base: { ...ctx.base, staffId }, n: { ...ctx.companies[0], staffId }, a: { ...ctx.companies[1], staffId },
    b: { ...ctx.companies[2], staffId }, s: { ...ctx.companies[3], staffId }, h: { ...ctx.companies[4], staffId } };

  const eq = {
    base: await ensureEquipos(conn, C.base.id, C.base.sedeId, EQUIPOS.base),
    n: await ensureEquipos(conn, C.n.id, C.n.sedeId, EQUIPOS[0]),
    a: await ensureEquipos(conn, C.a.id, C.a.sedeId, EQUIPOS[1]),
    b: await ensureEquipos(conn, C.b.id, C.b.sedeId, EQUIPOS[2]),
    s: await ensureEquipos(conn, C.s.id, C.s.sedeId, EQUIPOS[3]),
    h: await ensureEquipos(conn, C.h.id, C.h.sedeId, EQUIPOS[4]),
  };
  const baseExtra = await db.queryOne("SELECT ID FROM EQUIPOS WHERE EMPRESA_ID = :e AND NOMBRE = 'Cámara Entrada'", { e: C.base.id }, conn);
  if (baseExtra) eq.base['Cámara Entrada'] = baseExtra.id;

  // Planes: el básico lo crea seed-demo.js; aquí se agrega uno completo.
  const prem = await db.queryOne("SELECT ID FROM PLANES WHERE CODIGO = 'PLAN-PREMIUM'", {}, conn);
  if (!prem) {
    const p = await db.execute(
      `INSERT INTO PLANES (CODIGO, NOMBRE, DESCRIPCION, ALCANCE, PRECIO_MENSUAL, VISITAS_MES)
       VALUES ('PLAN-PREMIUM','Plan Premium Empresarial','Soporte, redes y CCTV con visitas quincenales','Mantenimiento preventivo de equipos, revisión de red y CCTV, soporte prioritario',650000,2) RETURNING ID INTO :id`,
      { id: idOut() }, conn);
    await db.execute(`INSERT INTO PLAN_SERVICIO (PLAN_ID, SERVICIO_ID) SELECT :p, ID FROM SERVICIOS WHERE CODIGO IN ('SOP-001','SOP-004','RED-003','CCT-003')`, { p: p.outBinds.id[0] }, conn);
  }
  const ctr = {
    base: await ensurePlanAndContract(conn, C.base, { planCodigo: 'PLAN-BASICO', observaciones: 'DEMO · Contrato vigente', inicioDias: 120, finDias: 245, estado: 'VIGENTE' }),
    h: await ensurePlanAndContract(conn, C.h, { planCodigo: 'PLAN-PREMIUM', observaciones: 'DEMO · Contrato premium vigente', inicioDias: 60, finDias: 305, estado: 'VIGENTE' }),
    a: await ensurePlanAndContract(conn, C.a, { planCodigo: 'PLAN-BASICO', observaciones: 'DEMO · Contrato vencido', inicioDias: 400, finDias: -35, estado: 'VENCIDO' }),
  };

  // helper: cotización con fechas pasadas + (opcional) orden
  async function flow(c, key, f) {
    const q = await ensureDemoQuote(conn, {
      empresaId: c.id, sedeId: c.sedeId, clienteId: c.clientId, creadoPor: staffId, equipoId: f.equipo ? eq[key][f.equipo] : null,
      asunto: f.asunto, descripcion: f.descripcion, estadoSolicitud: f.estSol, estadoCotizacion: f.estCot,
      nota: `DEMO: ${f.asunto.replace('DEMO · ', '')}`, servicios: f.servicios,
    });
    await backdateQuote(conn, q.quoteId, f.dias, f.estCot === 'VENCIDA' ? 15 : 30);
    await backdateRequest(conn, q.requestId, f.dias + 1);
    if (f.orden) {
      await ensureOrder(conn, c, { ...f.orden, solicitudId: q.requestId, cotizacionId: q.quoteId, equipoId: f.equipo ? eq[key][f.equipo] : null,
        servicioId: q.servicioId, dias: f.dias - 1 });
    }
    return q;
  }

  // ── Distribuidora Demo (cliente@) — la cuenta principal para mostrar el flujo completo
  await flow(C.base, 'base', { asunto: 'DEMO · Cambio de disco SSD en PC de Facturación', descripcion: 'El equipo tarda varios minutos en iniciar y se congela al facturar.', equipo: 'PC Facturación',
    estSol: 'RESUELTA', estCot: 'APROBADA', servicios: [{ codigo: 'SOP-004', cantidad: 1 }, { codigo: 'SOP-005', cantidad: 1 }], dias: 40,
    orden: { estado: 'FINALIZADA', tecnicoId: tecnicoId, prioridad: 'ALTA', trabajo: 'Reemplazo de disco y reinstalación del sistema.', diagnostico: 'Disco mecánico con sectores dañados.', solucion: 'Se instaló SSD, se restauró el software de facturación y se verificó el arranque.',
      detalle: [['ACTIVIDAD', 'Diagnóstico del disco y copia de seguridad', 1, 0], ['ACTIVIDAD', 'Instalación y configuración de SSD', 1, 0], ['MATERIAL', 'Disco SSD 480 GB', 1, 185000]] } });
  await flow(C.base, 'base', { asunto: 'DEMO · Configuración de red WiFi para visitantes', descripcion: 'Se requiere una red separada para clientes y proveedores.',
    estSol: 'EN_PROCESO', estCot: 'APROBADA', servicios: [{ codigo: 'RED-001', cantidad: 1 }, { codigo: 'RED-003', cantidad: 1 }], dias: 6,
    orden: { estado: 'EN_EJECUCION', tecnicoId: tecnicoId, prioridad: 'MEDIA', progOffset: 0, trabajo: 'Segmentar la red y publicar SSID de invitados.', diagnostico: 'Red plana sin segmentación; el router actual soporta VLAN.',
      detalle: [['ACTIVIDAD', 'Levantamiento de la red actual', 1, 0], ['MATERIAL', 'Patch cord Cat6 1 m', 6, 6500]] } });
  await flow(C.base, 'base', { asunto: 'DEMO · Revisión de impresora de bodega', descripcion: 'La impresora atasca papel de forma constante.', equipo: 'Impresora Bodega',
    estSol: 'AUTORIZADA', estCot: 'APROBADA', servicios: [{ codigo: 'SOP-006', cantidad: 1 }], dias: 3,
    orden: { estado: 'ASIGNADA', tecnicoId: tecnico2Id, prioridad: 'BAJA', progOffset: 2, trabajo: 'Limpieza de rodillos y prueba de alimentación.' } });
  await flow(C.base, 'base', { asunto: 'DEMO · Ampliación de cámaras de seguridad', descripcion: 'Se desea cubrir el acceso de proveedores y la zona de carga.',
    estSol: 'COTIZADA', estCot: 'ENVIADA', servicios: [{ codigo: 'CCT-001', cantidad: 2 }, { codigo: 'CCT-004', cantidad: 1 }], dias: 2 });
  await ensureRequest(conn, C.base, { asunto: 'DEMO · El computador de gerencia no enciende', descripcion: 'Desde esta mañana no da señal de video al encender.', servicio: 'SOP-004', categoria: 'SOPORTE_EQUIPOS', prioridad: 'URGENTE', estado: 'NUEVA', dias: 0 });

  // ── Oficina Demo Norte
  await flow(C.n, 'n', { asunto: 'DEMO · Cámara del parqueadero sin imagen', descripcion: 'La cámara dejó de transmitir desde la tormenta del fin de semana.', equipo: 'Cámara Parqueadero',
    estSol: 'RESUELTA', estCot: 'APROBADA', servicios: [{ codigo: 'CCT-004', cantidad: 1 }], dias: 25,
    orden: { estado: 'CERRADA', tecnicoId: tecnico2Id, prioridad: 'ALTA', trabajo: 'Revisión de cableado y fuente de poder.', diagnostico: 'Fuente PoE averiada por sobretensión.', solucion: 'Se reemplazó la fuente y se reconfiguró la cámara en el NVR.',
      detalle: [['ACTIVIDAD', 'Prueba de cableado UTP', 1, 0], ['MATERIAL', 'Inyector PoE', 1, 78000]] } });
  await flow(C.n, 'n', { asunto: 'DEMO · Cotización de cableado estructurado (rechazada)', descripcion: 'Cotización para 12 puntos de red nuevos.',
    estSol: 'CERRADA', estCot: 'RECHAZADA', servicios: [{ codigo: 'RED-004', cantidad: 12 }], dias: 33 });
  await ensureRequest(conn, C.n, { asunto: 'DEMO · Lentitud general en la red', descripcion: 'La navegación es lenta en la tarde.', servicio: 'RED-003', categoria: 'REDES', prioridad: 'MEDIA', estado: 'EN_REVISION', dias: 2 });

  // ── Comercio Demo Andino
  await flow(C.a, 'a', { asunto: 'DEMO · Mantenimiento preventivo de cajas', descripcion: 'Limpieza y optimización de los dos equipos de caja.', equipo: 'PC Caja 1',
    estSol: 'RESUELTA', estCot: 'APROBADA', servicios: [{ codigo: 'SOP-001', cantidad: 2 }], dias: 62,
    orden: { estado: 'CERRADA', tecnicoId: tecnicoId, trabajo: 'Mantenimiento preventivo de dos equipos.', diagnostico: 'Polvo acumulado y software desactualizado.', solucion: 'Limpieza interna, actualización y revisión de respaldos.',
      detalle: [['ACTIVIDAD', 'Limpieza interna y cambio de pasta térmica', 2, 0], ['MATERIAL', 'Pasta térmica', 2, 9000]] } });
  await flow(C.a, 'a', { asunto: 'DEMO · Cotización de adecuación del salón de ventas', descripcion: 'Cotización sin respuesta del cliente.',
    estSol: 'COTIZADA', estCot: 'VENCIDA', servicios: [{ codigo: 'ADE-001', cantidad: 10 }], dias: 50 });
  await ensureRequest(conn, C.a, { asunto: 'DEMO · Solicitud cancelada por duplicada', descripcion: 'Se creó dos veces por error.', servicio: 'SOP-007', categoria: 'SOPORTE_EQUIPOS', prioridad: 'BAJA', estado: 'CANCELADA', dias: 12 });

  // ── Bodega Demo Cúcuta
  await flow(C.b, 'b', { asunto: 'DEMO · DVR sin grabar', descripcion: 'El DVR no guarda grabaciones desde hace tres días.', equipo: 'DVR 16 canales',
    estSol: 'EN_PROCESO', estCot: 'APROBADA', servicios: [{ codigo: 'CCT-004', cantidad: 1 }, { codigo: 'SOP-009', cantidad: 1 }], dias: 9,
    orden: { estado: 'EN_EJECUCION', tecnicoId: tecnico2Id, prioridad: 'URGENTE', trabajo: 'Diagnóstico del DVR y reposición de disco.', diagnostico: 'Disco duro con fallas de lectura.',
      detalle: [['ACTIVIDAD', 'Diagnóstico del DVR', 1, 0], ['MATERIAL', 'Disco duro 2 TB vigilancia', 1, 290000]] } });
  await flow(C.b, 'b', { asunto: 'DEMO · Cotización de adecuación del muelle', descripcion: 'Cotización en revisión por el cliente.',
    estSol: 'COTIZADA', estCot: 'ENVIADA', servicios: [{ codigo: 'ADE-002', cantidad: 6 }], dias: 4 });

  // ── Restaurante El Sabor
  await flow(C.s, 's', { asunto: 'DEMO · Impresora de comandas sin imprimir', descripcion: 'No imprime los pedidos hacia cocina.', equipo: 'Impresora de comandas',
    estSol: 'AUTORIZADA', estCot: 'APROBADA', servicios: [{ codigo: 'SOP-006', cantidad: 1 }], dias: 5,
    orden: { estado: 'ASIGNADA', tecnicoId: tecnicoId, prioridad: 'ALTA', progOffset: 1, trabajo: 'Revisión de la impresora térmica y su conexión.' } });
  await flow(C.s, 's', { asunto: 'DEMO · Instalación de WiFi para comensales', descripcion: 'Se desea ofrecer internet a los clientes del comedor.',
    estSol: 'COTIZADA', estCot: 'BORRADOR', servicios: [{ codigo: 'RED-001', cantidad: 1 }], dias: 1 });

  // ── Clínica Salud Integral
  await flow(C.h, 'h', { asunto: 'DEMO · Reorganización del switch del piso 2', descripcion: 'Cables desordenados y puertos sin identificar.', equipo: 'Switch Piso 2',
    estSol: 'RESUELTA', estCot: 'APROBADA', servicios: [{ codigo: 'RED-003', cantidad: 1 }, { codigo: 'RED-004', cantidad: 8 }], dias: 18,
    orden: { estado: 'FINALIZADA', tecnicoId: tecnicoId, prioridad: 'MEDIA', trabajo: 'Rotulado y reorganización de puertos.', diagnostico: 'Sin identificación de puntos y patch cords en mal estado.', solucion: 'Se rotularon 24 puertos y se reemplazaron los patch cords dañados.',
      detalle: [['ACTIVIDAD', 'Rotulado de puntos de red', 24, 0], ['MATERIAL', 'Patch cord Cat6 0,5 m', 8, 5500]] } });
  await flow(C.h, 'h', { asunto: 'DEMO · Instalación de cámaras en sala de espera', descripcion: 'Ampliar la cobertura de CCTV.', equipo: 'Cámara Sala de espera',
    estSol: 'COTIZADA', estCot: 'ENVIADA', servicios: [{ codigo: 'CCT-001', cantidad: 3 }], dias: 7 });
  await flow(C.h, 'h', { asunto: 'DEMO · Adecuación del cuarto técnico', descripcion: 'Cotización anulada por cambio de alcance.',
    estSol: 'CANCELADA', estCot: 'ANULADA', servicios: [{ codigo: 'ADE-002', cantidad: 4 }], dias: 28 });

  // ── Mantenimientos (programados, vencidos, en ejecución, completados)
  const m = (c, key, t) => ensureMaintenance(conn, c, { equipoId: t.equipo ? eq[key][t.equipo] : null, ...t });
  await m(C.base, 'base', { titulo: 'DEMO · Preventivo trimestral de computadores', tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: 9, frecuencia: 90, tecnicoId, contratoId: ctr.base, descripcion: 'Limpieza interna, revisión de discos y actualizaciones.' });
  await m(C.base, 'base', { titulo: 'DEMO · Revisión de cámaras y NVR', tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: -4, frecuencia: 60, equipo: 'NVR 8 canales', tecnicoId, contratoId: ctr.base, descripcion: 'Verificar grabación, enfoque y almacenamiento (vencido).' });
  await m(C.base, 'base', { titulo: 'DEMO · Mantenimiento del switch principal', tipo: 'PREVENTIVO', estado: 'COMPLETADO', offset: -30, frecuencia: 90, equipo: 'Switch Principal', tecnicoId: tecnico2Id, contratoId: ctr.base, descripcion: 'Limpieza y revisión de puertos.', resultado: 'Sin novedades. Firmware actualizado y puertos verificados.' });
  await m(C.h, 'h', { titulo: 'DEMO · Visita quincenal Plan Premium', tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: 3, frecuencia: 15, tecnicoId: tecnico2Id, contratoId: ctr.h, descripcion: 'Revisión de equipos de admisiones y consultorios.' });
  await m(C.h, 'h', { titulo: 'DEMO · Corrección de lentitud en PC Admisiones', tipo: 'CORRECTIVO', estado: 'EN_EJECUCION', offset: 0, equipo: 'PC Admisiones', tecnicoId, contratoId: ctr.h, descripcion: 'Equipo lento en horas pico.' });
  await m(C.a, 'a', { titulo: 'DEMO · Revisión de cajas registradoras', tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: 18, frecuencia: 120, equipo: 'PC Caja 2', tecnicoId, descripcion: 'Verificación de respaldos y antivirus.' });
  await m(C.n, 'n', { titulo: 'DEMO · Revisión anual de access points', tipo: 'PREVENTIVO', estado: 'PROGRAMADO', offset: 27, frecuencia: 365, equipo: 'AP Sala de juntas', tecnicoId: tecnico2Id, descripcion: 'Actualización de firmware y canales.' });
  await m(C.s, 's', { titulo: 'DEMO · Limpieza del equipo POS de cocina', tipo: 'PREVENTIVO', estado: 'COMPLETADO', offset: -12, frecuencia: 90, equipo: 'POS Cocina', tecnicoId, descripcion: 'Limpieza por grasa y polvo.', resultado: 'Equipo limpio, ventilador reemplazado.' });

  // ── Notificaciones por rol (el cliente ve las suyas; el staff, las operativas)
  const cn = (u, e, n) => ensureNotification(conn, u, e, n);
  await cn(C.base.clientId, C.base.id, { tipo: 'COTIZACION_ENVIADA', titulo: 'Nueva cotización disponible', mensaje: 'Revise la cotización de ampliación de cámaras de seguridad.', enlace: '/cotizaciones', dias: 2 });
  await cn(C.base.clientId, C.base.id, { tipo: 'ORDEN_ACTUALIZADA', titulo: 'Su orden de servicio está en ejecución', mensaje: 'El técnico inició la configuración de la red WiFi.', enlace: '/ordenes', dias: 5, leida: true });
  await cn(C.h.clientId, C.h.id, { tipo: 'COTIZACION_ENVIADA', titulo: 'Nueva cotización disponible', mensaje: 'Cotización de cámaras en sala de espera lista para su revisión.', enlace: '/cotizaciones', dias: 7 });
  await cn(tecnicoId, null, { tipo: 'ORDEN_ASIGNADA', titulo: 'Se le asignó una orden de servicio', mensaje: 'Impresora de comandas sin imprimir — Restaurante Demo El Sabor.', enlace: '/ordenes', dias: 4 });
  await cn(tecnicoId, null, { tipo: 'MANTENIMIENTO_VENCIDO', titulo: 'Mantenimiento vencido', mensaje: 'Revisión de cámaras y NVR — Distribuidora Demo.', enlace: '/mantenimientos', dias: 1 });
  await cn(tecnico2Id, null, { tipo: 'ORDEN_ASIGNADA', titulo: 'Orden urgente asignada', mensaje: 'DVR sin grabar — Bodega Demo Cúcuta.', enlace: '/ordenes', dias: 9 });
  await cn(adminId, null, { tipo: 'SOLICITUD_NUEVA', titulo: 'Nueva solicitud urgente', mensaje: 'El computador de gerencia no enciende — Distribuidora Demo.', enlace: '/solicitudes', dias: 0 });
  await cn(superadminId, null, { tipo: 'COTIZACION_APROBADA', titulo: 'Cotización aprobada', mensaje: 'Reorganización del switch del piso 2 — Clínica Demo Salud Integral.', enlace: '/cotizaciones', dias: 18, leida: true });
}

module.exports = { seedRichDemo, EXTRA_COMPANIES };
