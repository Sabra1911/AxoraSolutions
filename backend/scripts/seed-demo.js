/* Datos de PRUEBA (no usar en producción). La contraseña de todos los usuarios demo viene de SEED_PASSWORD.
 * Cuentas: <rol>@DEMO_EMAIL_DOMAIN (por defecto demo.msenlinea.com). Ver docs/CONFIGURACION_DEMO.md. */
require('dotenv').config();
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Rechazado: NODE_ENV=production. Los datos demo no se cargan en producción (ALLOW_DEMO_SEED=true solo para una demo pública y aislada).');
  process.exit(1);
}
const db = require('../src/config/db');
const bcrypt = require('bcryptjs');
const { calcularTotales } = require('../src/core/totals');
const { seedRichDemo, EXTRA_COMPANIES } = require('./demo-data');

const DOMAIN = (process.env.DEMO_EMAIL_DOMAIN || 'demo.msenlinea.com').trim();
const RESET_PASSWORDS = process.env.DEMO_RESET_PASSWORDS === 'true';
const pw = process.env.SEED_PASSWORD;
if (!pw || pw.length < 10) { console.error('Defina SEED_PASSWORD (mín. 10 caracteres) en .env'); process.exit(1); }

const DEMO_COMPANIES = [
  {
    nit: 'DEMO-NIT-002', razon: 'Oficina Demo Norte S.A.S.', comercial: 'Oficina Demo Norte',
    sector: 'Servicios · DEMO', direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta',
    correo: 'contacto.norte@demo.invalid', contacto: 'Contacto DEMO Norte',
    usuario: 'cliente.norte@demo.invalid', nombreUsuario: 'Cliente DEMO Norte',
  },
  {
    nit: 'DEMO-NIT-003', razon: 'Comercio Demo Andino S.A.S.', comercial: 'Comercio Demo Andino',
    sector: 'Comercio · DEMO', direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta',
    correo: 'contacto.andino@demo.invalid', contacto: 'Contacto DEMO Andino',
    usuario: 'cliente.andino@demo.invalid', nombreUsuario: 'Cliente DEMO Andino',
  },
  {
    nit: 'DEMO-NIT-004', razon: 'Bodega Demo Cúcuta S.A.S.', comercial: 'Bodega Demo Cúcuta',
    sector: 'Logística · DEMO', direccion: 'Dirección ficticia de demostración', ciudad: 'Cúcuta',
    correo: 'contacto.bodega@demo.invalid', contacto: 'Contacto DEMO Bodega',
    usuario: 'cliente.bodega@demo.invalid', nombreUsuario: 'Cliente DEMO Bodega',
  },
];

async function upsertUser(conn, { email, nombre, rol, empresaId = null, hash }) {
  const ex = await db.queryOne('SELECT ID, EMPRESA_ID FROM USUARIOS WHERE EMAIL = :e', { e: email }, conn);
  if (ex && (ex.empresa_id ?? null) !== (empresaId ?? null)) {
    throw new Error(`El usuario demo ${email} ya está asociado a otra empresa.`);
  }
  let userId = ex?.id;
  if (userId && RESET_PASSWORDS) await db.execute('UPDATE USUARIOS SET PASSWORD_HASH = :h, ACTIVO = 1 WHERE ID = :id', { h: hash, id: userId }, conn);
  if (!userId) {
    const r = await db.execute(
      'INSERT INTO USUARIOS (EMPRESA_ID, EMAIL, NOMBRE, PASSWORD_HASH) VALUES (:emp, :e, :n, :h) RETURNING ID INTO :id',
      { emp: empresaId, e: email, n: nombre, h: hash, id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
    userId = r.outBinds.id[0];
  }
  await db.execute(
    `INSERT INTO USUARIO_ROL (USUARIO_ID, ROL_ID)
     SELECT :u, R.ID FROM ROLES R
      WHERE R.CODIGO = :c AND NOT EXISTS (
        SELECT 1 FROM USUARIO_ROL UR WHERE UR.USUARIO_ID = :u AND UR.ROL_ID = R.ID
      )`,
    { u: userId, c: rol }, conn);
  return userId;
}

async function ensureDemoCompany(conn, company) {
  let row = await db.queryOne('SELECT ID FROM EMPRESAS WHERE NIT = :nit', { nit: company.nit }, conn);
  let companyId = row?.id;
  if (!companyId) {
    const result = await db.execute(
      `INSERT INTO EMPRESAS (NIT, RAZON_SOCIAL, NOMBRE_COMERCIAL, SECTOR, DIRECCION, CIUDAD, EMAIL)
       VALUES (:nit, :razon, :comercial, :sector, :direccion, :ciudad, :correo) RETURNING ID INTO :id`,
      {
        nit: company.nit, razon: company.razon, comercial: company.comercial, sector: company.sector,
        direccion: company.direccion, ciudad: company.ciudad, correo: company.correo,
        id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      conn,
    );
    companyId = result.outBinds.id[0];
  }

  row = await db.queryOne('SELECT ID FROM SEDES WHERE EMPRESA_ID = :empresa AND NOMBRE = :nombre', {
    empresa: companyId, nombre: 'Sede DEMO',
  }, conn);
  let sedeId = row?.id;
  if (!sedeId) {
    const result = await db.execute(
      `INSERT INTO SEDES (EMPRESA_ID, NOMBRE, DIRECCION, CIUDAD)
       VALUES (:empresa, 'Sede DEMO', :direccion, :ciudad) RETURNING ID INTO :id`,
      {
        empresa: companyId, direccion: company.direccion, ciudad: company.ciudad,
        id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      conn,
    );
    sedeId = result.outBinds.id[0];
  }

  const contact = await db.queryOne('SELECT ID FROM CONTACTOS WHERE EMPRESA_ID = :empresa AND EMAIL = :correo', {
    empresa: companyId, correo: company.correo,
  }, conn);
  if (!contact) {
    await db.execute(
      `INSERT INTO CONTACTOS (EMPRESA_ID, SEDE_ID, NOMBRE, CARGO, EMAIL, PRINCIPAL)
       VALUES (:empresa, :sede, :nombre, 'Contacto de demostración', :correo, 1)`,
      { empresa: companyId, sede: sedeId, nombre: company.contacto, correo: company.correo }, conn);
  }
  return { id: companyId, sedeId };
}

async function ensureDemoQuote(conn, {
  empresaId, sedeId, clienteId, creadoPor, asunto, descripcion, estadoSolicitud, estadoCotizacion, nota, servicios, equipoId = null,
}) {
  const serviceRows = [];
  for (const item of servicios) {
    const service = await db.queryOne(
      'SELECT ID, CODIGO, LINEA, NOMBRE, PRECIO_BASE FROM SERVICIOS WHERE CODIGO = :codigo AND ACTIVO = 1',
      { codigo: item.codigo }, conn);
    if (!service) throw new Error(`Falta el servicio de catálogo ${item.codigo}; ejecute db:migrate.`);
    serviceRows.push({ ...service, cantidad: item.cantidad });
  }

  let request = await db.queryOne(
    'SELECT ID FROM SOLICITUDES WHERE EMPRESA_ID = :empresa AND ASUNTO = :asunto',
    { empresa: empresaId, asunto }, conn);
  let requestId = request?.id;
  if (!requestId) {
    const category = ['SOPORTE_EQUIPOS', 'REDES', 'CCTV'].includes(serviceRows[0].linea)
      ? serviceRows[0].linea : 'OTRO';
    const created = await db.execute(
      `INSERT INTO SOLICITUDES
         (EMPRESA_ID, SEDE_ID, EQUIPO_ID, SERVICIO_ID, SOLICITANTE_ID, CATEGORIA, ASUNTO, DESCRIPCION, ESTADO)
       VALUES (:empresa, :sede, :equipo, :servicio, :cliente, :categoria, :asunto, :descripcion, :estado)
       RETURNING ID INTO :id`,
      {
        empresa: empresaId, sede: sedeId, equipo: equipoId, servicio: serviceRows[0].id, cliente: clienteId,
        categoria: category, asunto, descripcion, estado: estadoSolicitud,
        id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      conn,
    );
    requestId = created.outBinds.id[0];
    await db.execute(
      `INSERT INTO HISTORIAL_ESTADOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, ESTADO_NUEVO, COMENTARIO, USUARIO_ID)
       VALUES ('SOLICITUD', :id, :empresa, :estado, 'Registro ficticio de demostración', :usuario)`,
      { id: requestId, empresa: empresaId, estado: estadoSolicitud, usuario: clienteId }, conn);
  }

  const existing = await db.queryOne(
    'SELECT ID FROM COTIZACIONES WHERE SOLICITUD_ID = :solicitud AND NOTAS = :nota',
    { solicitud: requestId, nota }, conn);
  if (existing) return { quoteId: existing.id, requestId, servicioId: serviceRows[0].id };

  const totals = calcularTotales(serviceRows.map((service) => ({
    servicio_id: service.id,
    descripcion: service.nombre,
    cantidad: service.cantidad,
    precio_unitario: Number(service.precio_base),
  })));
  const quote = await db.execute(
    `INSERT INTO COTIZACIONES
       (EMPRESA_ID, SOLICITUD_ID, CREADO_POR, ESTADO, VALIDEZ_HASTA, SUBTOTAL, DESCUENTO,
        IVA_PORCENTAJE, IVA_VALOR, TOTAL, NOTAS, RESPONDIDO_POR, FECHA_RESPUESTA)
     VALUES (:empresa, :solicitud, :creadoPor, :estado, TRUNC(SYSDATE) + 30, :subtotal, :descuento,
        :ivaPorcentaje, :ivaValor, :total, :nota, :respondidoPor,
        CASE WHEN :respondidoPor IS NULL THEN NULL ELSE SYSTIMESTAMP END)
     RETURNING ID INTO :id`,
    {
      empresa: empresaId, solicitud: requestId, creadoPor, estado: estadoCotizacion,
      subtotal: totals.subtotal, descuento: totals.descuento, ivaPorcentaje: totals.iva_porcentaje,
      ivaValor: totals.iva_valor, total: totals.total, nota,
      respondidoPor: estadoCotizacion === 'APROBADA' ? clienteId : null,
      id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
    },
    conn,
  );
  const quoteId = quote.outBinds.id[0];
  for (const item of totals.lineas) {
    await db.execute(
      `INSERT INTO DETALLE_COTIZACION
         (COTIZACION_ID, SERVICIO_ID, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, TOTAL_LINEA)
       VALUES (:cotizacion, :servicio, :descripcion, :cantidad, :precio, :total)`,
      {
        cotizacion: quoteId, servicio: item.servicio_id, descripcion: item.descripcion,
        cantidad: item.cantidad, precio: item.precio_unitario, total: item.total_linea,
      },
      conn,
    );
  }
  await db.execute(
    `INSERT INTO HISTORIAL_ESTADOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, ESTADO_NUEVO, COMENTARIO, USUARIO_ID)
     VALUES ('COTIZACION', :id, :empresa, :estado, 'Registro ficticio de demostración', :usuario)`,
    { id: quoteId, empresa: empresaId, estado: estadoCotizacion, usuario: creadoPor }, conn);
  return { quoteId, requestId, servicioId: serviceRows[0].id };
}

/** Orden de servicio demo generada desde una cotización aprobada y asignada al técnico demo (mismo estado inicial del flujo real). */
async function ensureDemoOrder(conn, { empresaId, sedeId, solicitudId, cotizacionId, equipoId, servicioId, tecnicoId, creadoPor }) {
  const ex = await db.queryOne('SELECT ID FROM ORDENES_SERVICIO WHERE COTIZACION_ID = :c', { c: cotizacionId }, conn);
  if (ex) return ex.id;
  const r = await db.execute(
    `INSERT INTO ORDENES_SERVICIO (EMPRESA_ID, SEDE_ID, SOLICITUD_ID, COTIZACION_ID, EQUIPO_ID, SERVICIO_ID, TECNICO_ID, CREADO_POR, ESTADO, PRIORIDAD, DESCRIPCION_TRABAJO, FECHA_PROGRAMADA)
     VALUES (:empresa, :sede, :solicitud, :cotizacion, :equipo, :servicio, :tecnico, :creadoPor, 'ASIGNADA', 'MEDIA', 'DEMO: orden de ejemplo generada desde la cotización aprobada.', TRUNC(SYSDATE) + 2)
     RETURNING ID INTO :id`,
    { empresa: empresaId, sede: sedeId, solicitud: solicitudId, cotizacion: cotizacionId, equipo: equipoId, servicio: servicioId, tecnico: tecnicoId, creadoPor,
      id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
  const orderId = r.outBinds.id[0];
  await db.execute(`INSERT INTO ASIGNACIONES (ENTIDAD, ENTIDAD_ID, TECNICO_ID, ASIGNADO_POR) VALUES ('ORDEN', :o, :t, :a)`, { o: orderId, t: tecnicoId, a: creadoPor }, conn);
  await db.execute(`INSERT INTO HISTORIAL_ESTADOS (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, EQUIPO_ID, ESTADO_NUEVO, COMENTARIO, USUARIO_ID)
     VALUES ('ORDEN', :o, :e, :q, 'ASIGNADA', 'Registro ficticio de demostración', :u)`, { o: orderId, e: empresaId, q: equipoId, u: creadoPor }, conn);
  return orderId;
}

(async () => {
  await db.init();
  try {
    const hash = await bcrypt.hash(pw, 12);
    await db.withTransaction(async (conn) => {
      const superadminId = await upsertUser(conn, { email: `superadmin@${DOMAIN}`, nombre: 'Superadministrador Demo', rol: 'SUPERADMIN', hash });
      const adminId = await upsertUser(conn, { email: `admin@${DOMAIN}`, nombre: 'Administrador Demo', rol: 'ADMIN', hash });
      const tecnicoId = await upsertUser(conn, { email: `tecnico@${DOMAIN}`, nombre: 'Técnico Demo', rol: 'TECNICO', hash });
      const tecnico2Id = await upsertUser(conn, { email: `tecnico2@${DOMAIN}`, nombre: 'Técnico Demo 2', rol: 'TECNICO', hash });

      let emp = await db.queryOne("SELECT ID FROM EMPRESAS WHERE NIT = '900123456-1'", {}, conn);
      let empId = emp?.id;
      if (!empId) {
        const r = await db.execute(
          `INSERT INTO EMPRESAS (NIT, RAZON_SOCIAL, NOMBRE_COMERCIAL, SECTOR, DIRECCION, TELEFONO, EMAIL) VALUES ('900123456-1','Distribuidora Demo S.A.S.','Distribuidora Demo','Comercio','Av. Libertadores #10-20','3000000000','contacto@demo.local') RETURNING ID INTO :id`,
          { id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
        empId = r.outBinds.id[0];
        const s = await db.execute(`INSERT INTO SEDES (EMPRESA_ID, NOMBRE, DIRECCION, CIUDAD) VALUES (:e,'Sede Principal','Av. Libertadores #10-20','Cúcuta') RETURNING ID INTO :id`,
          { e: empId, id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
        const sedeId = s.outBinds.id[0];
        await db.execute(`INSERT INTO CONTACTOS (EMPRESA_ID, SEDE_ID, NOMBRE, CARGO, EMAIL, PRINCIPAL) VALUES (:e,:s,'Laura Gómez','Gerente administrativa','laura@demo.local',1)`, { e: empId, s: sedeId }, conn);
        for (const [tipo, nombre, marca] of [['COMPUTADOR', 'PC Contabilidad', 'Dell'], ['PORTATIL', 'Portátil Gerencia', 'Lenovo'], ['CAMARA', 'Cámara Entrada', 'Hikvision'], ['ROUTER', 'Router Principal', 'TP-Link']]) {
          await db.execute('INSERT INTO EQUIPOS (EMPRESA_ID, SEDE_ID, TIPO, NOMBRE, MARCA) VALUES (:e,:s,:t,:n,:m)', { e: empId, s: sedeId, t: tipo, n: nombre, m: marca }, conn);
        }
      }
      const baseClientId = await upsertUser(conn, { email: `cliente@${DOMAIN}`, nombre: 'Laura Gómez', rol: 'CLIENTE', empresaId: empId, hash });
      const baseSede = await db.queryOne('SELECT ID FROM SEDES WHERE EMPRESA_ID = :empresa ORDER BY ID FETCH FIRST 1 ROWS ONLY', { empresa: empId }, conn);
      if (!baseSede) throw new Error('La empresa de demostración no tiene sede.');

      // Cadena completa: Empresa demo → Usuario cliente → Equipo → Solicitud → Cotización aprobada → Orden asignada
      const equipoBase = await db.queryOne("SELECT ID FROM EQUIPOS WHERE EMPRESA_ID = :e AND NOMBRE = 'PC Contabilidad'", { e: empId }, conn);
      if (equipoBase) {
        const chain = await ensureDemoQuote(conn, {
          empresaId: empId, sedeId: baseSede.id, clienteId: baseClientId, creadoPor: superadminId, equipoId: equipoBase.id,
          asunto: 'DEMO · Mantenimiento correctivo del PC de Contabilidad', descripcion: 'Solicitud ficticia con equipo, cotización aprobada y orden de servicio asignada.',
          estadoSolicitud: 'AUTORIZADA', estadoCotizacion: 'APROBADA', nota: 'DEMO: Cotización aprobada con orden de servicio asociada.',
          servicios: [{ codigo: 'SOP-004', cantidad: 1 }],
        });
        await ensureDemoOrder(conn, { empresaId: empId, sedeId: baseSede.id, solicitudId: chain.requestId, cotizacionId: chain.quoteId, equipoId: equipoBase.id, servicioId: chain.servicioId, tecnicoId, creadoPor: superadminId });
      }

      const demoClients = [];
      for (const company of [...DEMO_COMPANIES, ...EXTRA_COMPANIES]) {
        const demoCompany = await ensureDemoCompany(conn, company);
        const clientId = await upsertUser(conn, {
          email: company.usuario, nombre: company.nombreUsuario, rol: 'CLIENTE', empresaId: demoCompany.id, hash,
        });
        demoClients.push({ ...demoCompany, clientId });
      }

      const plan = await db.queryOne("SELECT ID FROM PLANES WHERE CODIGO = 'PLAN-BASICO'", {}, conn);
      if (!plan) {
        const p = await db.execute(`INSERT INTO PLANES (CODIGO, NOMBRE, DESCRIPCION, ALCANCE, PRECIO_MENSUAL, VISITAS_MES) VALUES ('PLAN-BASICO','Plan Básico Pyme','Mantenimiento preventivo mensual','Hasta 10 equipos y 1 visita mensual',350000,1) RETURNING ID INTO :id`,
          { id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER } }, conn);
        await db.execute(`INSERT INTO PLAN_SERVICIO (PLAN_ID, SERVICIO_ID) SELECT :p, ID FROM SERVICIOS WHERE CODIGO IN ('SOP-001','RED-003','CCT-003')`, { p: p.outBinds.id[0] }, conn);
      }

      await ensureDemoQuote(conn, {
        empresaId: empId, sedeId: baseSede.id, clienteId: baseClientId, creadoPor: superadminId,
        asunto: 'DEMO · Mantenimiento y formateo de computador', descripcion: 'Solicitud ficticia para mostrar una cotización en borrador.',
        estadoSolicitud: 'NUEVA', estadoCotizacion: 'BORRADOR', nota: 'DEMO: Borrador de ejemplo; no enviar al cliente.',
        servicios: [{ codigo: 'SOP-004', cantidad: 1 }],
      });
      await ensureDemoQuote(conn, {
        empresaId: demoClients[0].id, sedeId: demoClients[0].sedeId, clienteId: demoClients[0].clientId, creadoPor: superadminId,
        asunto: 'DEMO · Instalación de cámaras en sede', descripcion: 'Solicitud ficticia para mostrar una cotización enviada.',
        estadoSolicitud: 'COTIZADA', estadoCotizacion: 'ENVIADA', nota: 'DEMO: Ejemplo de cotización enviada; no enviar al cliente.',
        servicios: [{ codigo: 'CCT-001', cantidad: 1 }, { codigo: 'CCT-004', cantidad: 1 }],
      });
      await ensureDemoQuote(conn, {
        empresaId: demoClients[1].id, sedeId: demoClients[1].sedeId, clienteId: demoClients[1].clientId, creadoPor: superadminId,
        asunto: 'DEMO · Adecuación de techo y pared', descripcion: 'Solicitud ficticia para mostrar una cotización aprobada.',
        estadoSolicitud: 'AUTORIZADA', estadoCotizacion: 'APROBADA', nota: 'DEMO: Ejemplo de cotización aprobada; no enviar al cliente.',
        servicios: [{ codigo: 'ADE-002', cantidad: 8 }, { codigo: 'ADE-001', cantidad: 5 }],
      });

      await seedRichDemo(conn, {
        ensureDemoQuote, superadminId, adminId, tecnicoId, tecnico2Id,
        base: { id: empId, sedeId: baseSede.id, clientId: baseClientId },
        companies: demoClients.map((c) => ({ id: c.id, sedeId: c.sedeId, clientId: c.clientId })),
      });
    });
    console.log(`Datos demo cargados. Cuentas: superadmin@${DOMAIN}, admin@${DOMAIN}, tecnico@${DOMAIN}, tecnico2@${DOMAIN}, cliente@${DOMAIN} y clientes de 5 empresas demo (clave = SEED_PASSWORD).`);
  } catch (e) { console.error('Error:', e.message); process.exitCode = 1; } finally { await db.close(); }
})();
