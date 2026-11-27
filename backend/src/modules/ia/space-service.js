const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../config/db');
const env = require('../../config/env');
const { audit } = require('../../core/audit');
const { forbidden, badRequest, notFound, conflict, AppError } = require('../../core/errors');
const { minimizeText } = require('../../core/privacy');
const { matchesSignature, safeName, UPLOAD_ROOT } = require('../../middleware/upload');
const aiProvider = require('../../integrations/ai-provider');
const solicitudes = require('../solicitudes/module').service;
const { z } = require('../../core/schemas');
const { notifyCompany } = require('../../core/notify');
const MANUAL_MODEL = 'Manual (profesional)';

const SERVICE_TYPES = [
  { clave: 'CIELO_PVC', nombre: 'Instalación de PVC en techos', pregunta: '¿Quieres ver cómo quedaría un techo en PVC?', codigoCatalogo: 'ADE-002', hint: 'Color, acabado y zona del techo.' },
  { clave: 'PANELES_DECORATIVOS', nombre: 'Instalación de PVC/WPC marmolizado en paredes', pregunta: '¿Quieres añadir una lámina o panel decorativo en una pared?', codigoCatalogo: 'ADE-001', hint: 'Pared, acabado y zona aproximada.' },
  { clave: 'CAMARAS_SEGURIDAD', nombre: 'Instalación de cámaras de seguridad en poste', pregunta: '¿Quieres ver cómo quedaría una cámara de seguridad?', codigoCatalogo: 'CCT-001', hint: 'Cantidad y ubicaciones aproximadas.' },
  { clave: 'INSTALACIONES_ELECTRICAS', nombre: 'Instalación de puntos eléctricos', pregunta: '¿Quieres agregar puntos eléctricos?', codigoCatalogo: 'ADE-004', hint: 'Cantidad y ubicación aproximada.' },
  { clave: 'REDES_CABLEADO', nombre: 'Instalación de redes', pregunta: '¿Quieres agregar redes o cableado?', codigoCatalogo: 'RED-001', hint: 'Cantidad y ubicación aproximada de puntos de red.' },
  { clave: 'ADECUACIONES_TECNOLOGICAS', nombre: 'Adecuaciones tecnológicas', pregunta: '¿Quieres incluir otro elemento tecnológico?', hint: 'Describe el requerimiento tecnológico.' },
];

const selectionSchema = z.object({
  clave: z.enum([...SERVICE_TYPES.map((item) => item.clave), 'CATALOGO']),
  servicio_id: z.number().int().positive().optional(),
  especificaciones: z.string().trim().max(400).default(''),
}).strict();
const analyzeSchema = z.object({
  confirmar_envio: z.literal(true),
  servicios: z.array(selectionSchema).min(1).max(6),
  observaciones: z.string().trim().max(1000).default(''),
});
/** Propuesta manual: no se envía nada a ningún proveedor de IA, por eso no exige consentimiento. */
const manualSchema = z.object({
  servicios: z.array(selectionSchema).min(1).max(6),
  descripcion: z.string().trim().min(10, 'Describa la adecuación (mínimo 10 caracteres).').max(500),
  observaciones: z.string().trim().max(1000).default(''),
  materiales: z.array(z.string().trim().min(1).max(100)).max(6).default([]),
}).strict();
const analysisSchema = z.object({
  descripcion_espacio: z.string().trim().min(1).max(400),
  elementos_visibles: z.array(z.string().trim().min(1).max(100)).max(5),
  adecuaciones: z.string().trim().min(1).max(500),
  materiales_sugeridos: z.array(z.string().trim().min(1).max(100)).max(6),
  observaciones: z.array(z.string().trim().min(1).max(160)).max(6),
  recomendaciones: z.array(z.object({
    codigo_servicio: z.string().trim().min(1).max(30),
    motivo: z.string().trim().min(1).max(140),
  }).strict()).max(5),
}).strict();

function assertRole(user) {
  if (!user.isClient && !user.isStaff && !user.isTecnicoOnly) throw forbidden();
}
/** Personal de AXORA que puede mostrar una imagen manual al cliente: administración y técnicos. */
const isProfessional = (user) => !!user.isStaff || !!user.isTecnicoOnly;

function safePath(relativePath) {
  const full = path.resolve(UPLOAD_ROOT, relativePath || '');
  if (!relativePath || !full.startsWith(`${UPLOAD_ROOT}${path.sep}`)) {
    throw new AppError(500, 'INVALID_FILE_PATH', 'No se pudo resolver el archivo de la propuesta.');
  }
  return full;
}

function relativePath(fullPath) {
  return path.join(path.basename(path.dirname(fullPath)), path.basename(fullPath));
}

function boundedName(value, limit = 240) {
  let result = '';
  for (const character of safeName(value)) {
    if (Buffer.byteLength(result + character, 'utf8') > limit) break;
    result += character;
  }
  return result || 'fotografia';
}

function parseJson(value, label) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(500, 'INVALID_STORED_DATA', `No se pudo leer ${label} guardado.`);
  }
}

async function getVisible(user, proposalId, conn = null) {
  assertRole(user);
  const scope = user.isClient ? 'AND EMPRESA_ID = :empresa' : '';
  const binds = user.isClient ? { id: proposalId, empresa: user.empresaId } : { id: proposalId };
  const proposal = await db.queryOne(
    `SELECT * FROM PROPUESTAS_ESPACIO WHERE ID = :id ${scope} AND ESTADO <> 'ELIMINADA'`,
    binds,
    conn,
  );
  if (!proposal) throw notFound('Propuesta');
  // El técnico solo ve propuestas manuales (las que necesitan una imagen elaborada por una persona).
  if (user.isTecnicoOnly && !isManualAnalysis(parseJson(proposal.analisis_json, 'el análisis'))) throw notFound('Propuesta');
  return proposal;
}

async function catalogRows() {
  return db.query(
    `SELECT ID, CODIGO, LINEA, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD
       FROM SERVICIOS WHERE ACTIVO = 1 ORDER BY LINEA, NOMBRE`,
  );
}

function matchCatalog(type, rows) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const exact = rows.find((row) => row.codigo === type.codigoCatalogo);
  if (exact) return exact;
  if (type.clave === 'CAMARAS_SEGURIDAD') {
    return rows.find((row) => normalize(row.nombre).includes('CAMARA') && normalize(row.nombre).includes('INSTALACION'))
      || rows.find((row) => String(row.linea).toUpperCase() === 'CCTV');
  }
  if (type.clave === 'REDES_CABLEADO') {
    return rows.find((row) => String(row.linea).toUpperCase() === 'REDES');
  }
  return null;
}

async function catalog() {
  const rows = await catalogRows();
  return {
    opciones: SERVICE_TYPES.map((type) => {
      const match = matchCatalog(type, rows);
      return {
        clave: type.clave,
        nombre: type.nombre,
        pregunta: type.pregunta,
        especificacionesAyuda: type.hint,
        catalogo: match ? {
          id: match.id,
          codigo: match.codigo,
          nombre: match.nombre,
          precio_base: match.precio_base,
          unidad: match.unidad,
        } : null,
      };
    }),
    servicios: rows.map(({ id, codigo, linea, nombre, descripcion, precio_base, unidad }) => ({
      id, codigo, linea, nombre, descripcion, precio_base, unidad,
    })),
  };
}

async function normalizeServices(inputs, rows) {
  const seen = new Set();
  const normalized = inputs.map((input) => {
    let service;
    let clave = input.clave;
    let nombre;
    if (input.clave === 'CATALOGO') {
      if (!input.servicio_id) throw badRequest('Seleccione un servicio válido del catálogo.');
      service = rows.find((row) => row.id === input.servicio_id);
      if (!service) throw badRequest('El servicio seleccionado no existe o está inactivo.');
      clave = `CATALOGO_${service.id}`;
      nombre = service.nombre;
    } else {
      const type = SERVICE_TYPES.find((item) => item.clave === input.clave);
      service = matchCatalog(type, rows);
      nombre = service?.nombre || type.nombre;
    }
    if (seen.has(clave)) throw badRequest('No se puede seleccionar dos veces el mismo servicio.');
    seen.add(clave);
    return {
      clave,
      nombre,
      servicio_id: service?.id ?? null,
      codigo: service?.codigo ?? null,
      especificaciones: minimizeText(input.especificaciones, 400),
    };
  });
  const encoded = JSON.stringify(normalized);
  if (normalized.some((item) => Buffer.byteLength(item.especificaciones, 'utf8') > 900)
    || Buffer.byteLength(encoded, 'utf8') > 3800) {
    throw badRequest('Las especificaciones son demasiado extensas. Redúzcalas para guardar la propuesta.');
  }
  return normalized;
}

const cleanAnalysis = (raw, rows, selected) => {
  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(502, 'AI_INVALID_RESPONSE', `${aiProvider.label()} devolvió un análisis con campos inválidos.`);
  const allowed = new Map(rows.map((row) => [String(row.codigo).toUpperCase(), row]));
  const selectedIds = new Set(selected.map((item) => item.servicio_id).filter(Boolean));
  const recommendations = parsed.data.recomendaciones.flatMap((item) => {
    const service = allowed.get(item.codigo_servicio.toUpperCase());
    if (!service || selectedIds.has(service.id)) {
      if (!service) console.warn('[ia espacios] se descartó una recomendación fuera del catálogo activo');
      return [];
    }
    return [{ codigo_servicio: service.codigo, motivo: item.motivo }];
  });
  const analysis = { ...parsed.data, recomendaciones: recommendations };
  const materialsJson = JSON.stringify(analysis.materiales_sugeridos);
  const observationsJson = JSON.stringify(analysis.observaciones);
  const recommendationsJson = JSON.stringify(analysis.recomendaciones);
  if (Buffer.byteLength(analysis.adecuaciones, 'utf8') > 1800
    || Buffer.byteLength(materialsJson, 'utf8') > 2900
    || Buffer.byteLength(observationsJson, 'utf8') > 2900
    || Buffer.byteLength(recommendationsJson, 'utf8') > 3900
    || Buffer.byteLength(JSON.stringify(analysis), 'utf8') > 3900) {
    throw new AppError(502, 'AI_INVALID_RESPONSE', `El análisis de ${aiProvider.label()} excede el tamaño permitido.`);
  }
  return analysis;
};

async function createDraft(ctx, file, requestedCompanyId) {
  const user = ctx.user;
  assertRole(user);
  const empresaId = user.isClient ? user.empresaId : Number(requestedCompanyId);
  if (!empresaId) throw badRequest('No se pudo determinar la empresa de la propuesta.');
  const empresa = await db.queryOne('SELECT ID FROM EMPRESAS WHERE ID = :id AND ACTIVO = 1', { id: empresaId });
  if (!empresa) throw badRequest('La empresa no existe o está inactiva.');

  const id = await db.withTransaction(async (conn) => {
    const result = await db.execute(
      `INSERT INTO PROPUESTAS_ESPACIO
         (EMPRESA_ID, CREADO_POR, ESTADO, FOTOGRAFIA_ARCHIVO, FOTOGRAFIA_NOMBRE, FOTOGRAFIA_MIME, FOTOGRAFIA_TAMANO)
       VALUES (:empresa, :usuario, 'BORRADOR', :archivo, :nombre, :mime, :tamano)
       RETURNING ID INTO :out_id`,
      {
        empresa: empresaId,
        usuario: user.id,
        archivo: relativePath(file.path),
        nombre: boundedName(file.originalname),
        mime: file.mimetype,
        tamano: file.size,
        out_id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      conn,
    );
    const proposalId = result.outBinds.out_id[0];
    await audit(ctx, 'CREAR', 'PROPUESTA_ESPACIO', proposalId, { empresaId }, conn);
    return proposalId;
  });
  return {
    id,
    empresa_id: empresaId,
    estado: 'BORRADOR',
    fotografia_nombre: boundedName(file.originalname),
    fotografia_mime: file.mimetype,
    fotografia_tamano: file.size,
    servicios: null,
    observaciones_cliente: null,
    analisis: null,
    solicitud_id: null,
    versiones: [],
  };
}

async function list(user) {
  assertRole(user);
  const scope = user.isClient ? 'AND P.EMPRESA_ID = :empresa' : '';
  const binds = user.isClient ? { empresa: user.empresaId } : {};
  return db.query(
    `SELECT P.ID, P.ESTADO, P.FOTOGRAFIA_NOMBRE, P.SOLICITUD_ID, P.CREADO_EN,
            (SELECT MAX(V.NUMERO) FROM PROPUESTA_ESPACIO_VERSIONES V WHERE V.PROPUESTA_ID = P.ID) AS ULTIMA_VERSION,
            CASE WHEN P.ANALISIS_JSON LIKE '%"modo":"MANUAL"%' THEN 1 ELSE 0 END AS MANUAL
       FROM PROPUESTAS_ESPACIO P
      WHERE P.ESTADO <> 'ELIMINADA' ${scope} ${user.isTecnicoOnly ? `AND P.ANALISIS_JSON LIKE '%"modo":"MANUAL"%'` : ''}
      ORDER BY P.CREADO_EN DESC FETCH FIRST 50 ROWS ONLY`,
    binds,
  );
}

async function getDetail(user, proposalId) {
  const proposal = await getVisible(user, proposalId);
  const versions = await db.query(
    `SELECT ID, NUMERO, IMAGEN_MIME, IMAGEN_TAMANO, DESCRIPCION, MATERIALES_JSON,
            OBSERVACIONES_JSON, RECOMENDACIONES_JSON, MODELO, CREADO_EN
       FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id ORDER BY NUMERO DESC`,
    { id: proposalId },
  );
  const versionsWithServices = await Promise.all(versions.map(async (version) => {
    const services = await db.query(
      `SELECT SERVICIO_ID, CLAVE, CODIGO, NOMBRE, ESPECIFICACIONES
         FROM PROPUESTA_ESPACIO_SERVICIOS WHERE VERSION_ID = :id ORDER BY ID`,
      { id: version.id },
    );
    return {
      id: version.id,
      numero: version.numero,
      mime: version.imagen_mime,
      tamano: version.imagen_tamano,
      descripcion: version.descripcion,
      materiales: parseJson(version.materiales_json, 'los materiales'),
      observaciones: parseJson(version.observaciones_json, 'las observaciones'),
      recomendaciones: parseJson(version.recomendaciones_json, 'las recomendaciones'),
      modelo: version.modelo,
      creado_en: version.creado_en,
      servicios: services,
    };
  }));
  return {
    id: proposal.id,
    empresa_id: proposal.empresa_id,
    estado: proposal.estado,
    fotografia_nombre: proposal.fotografia_nombre,
    fotografia_mime: proposal.fotografia_mime,
    fotografia_tamano: proposal.fotografia_tamano,
    servicios: parseJson(proposal.servicios_json, 'los servicios'),
    observaciones_cliente: proposal.observaciones_cliente,
    analisis: parseJson(proposal.analisis_json, 'el análisis'),
    solicitud_id: proposal.solicitud_id,
    creado_en: proposal.creado_en,
    versiones: versionsWithServices,
  };
}

/**
 * Un profesional (administración o técnico) sube a una propuesta MANUAL la imagen que quiere mostrarle al cliente
 * (un boceto, un render hecho por una persona, una foto marcada). Se guarda como una versión más con modelo
 * «Manual (profesional)»; no se presenta como generada por IA y el cliente recibe una notificación.
 */
async function addProfessionalImage(ctx, proposalId, file, descripcion) {
  const { user } = ctx;
  if (!isProfessional(user)) throw forbidden();
  const proposal = await getVisible(user, proposalId);
  const analysis = parseJson(proposal.analisis_json, 'el análisis');
  if (!isManualAnalysis(analysis)) throw badRequest('Solo se puede añadir una imagen manual a una propuesta creada en modo manual.');
  const services = parseJson(proposal.servicios_json, 'los servicios') || [];
  const text = minimizeText(descripcion || '', 500) || 'Imagen preparada por un profesional de AXORA para mostrarte cómo podría quedar. Es una propuesta conceptual sujeta a inspección técnica.';
  const versionId = await db.withTransaction(async (conn) => {
    const locked = await db.queryOne('SELECT ESTADO FROM PROPUESTAS_ESPACIO WHERE ID = :id FOR UPDATE', { id: proposalId }, conn);
    if (!locked || locked.estado === 'ELIMINADA') throw notFound('Propuesta');
    const next = await db.queryOne('SELECT NVL(MAX(NUMERO), 0) + 1 AS NUMERO FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id', { id: proposalId }, conn);
    const result = await db.execute(
      `INSERT INTO PROPUESTA_ESPACIO_VERSIONES
         (PROPUESTA_ID, NUMERO, IMAGEN_ARCHIVO, IMAGEN_MIME, IMAGEN_TAMANO, DESCRIPCION, MATERIALES_JSON, OBSERVACIONES_JSON, RECOMENDACIONES_JSON, MODELO)
       VALUES (:proposal, :numero, :archivo, :mime, :tamano, :descripcion, :materiales, :observaciones, :recomendaciones, :modelo)
       RETURNING ID INTO :out_id`,
      {
        proposal: proposalId, numero: next.numero, archivo: relativePath(file.path), mime: file.mimetype, tamano: file.size, descripcion: text,
        materiales: JSON.stringify(analysis.materiales_sugeridos || []), observaciones: JSON.stringify(analysis.observaciones || []), recomendaciones: '[]',
        modelo: MANUAL_MODEL, out_id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      conn,
    );
    const id = result.outBinds.out_id[0];
    for (const service of services) {
      await db.execute(
        `INSERT INTO PROPUESTA_ESPACIO_SERVICIOS (VERSION_ID, SERVICIO_ID, CLAVE, CODIGO, NOMBRE, ESPECIFICACIONES)
         VALUES (:version, :servicio, :clave, :codigo, :nombre, :especificaciones)`,
        { version: id, servicio: service.servicio_id, clave: service.clave, codigo: service.codigo, nombre: service.nombre, especificaciones: service.especificaciones || null },
        conn,
      );
    }
    await db.execute('UPDATE PROPUESTAS_ESPACIO SET ACTUALIZADO_EN = SYSTIMESTAMP WHERE ID = :id', { id: proposalId }, conn);
    await notifyCompany(conn, proposal.empresa_id, { tipo: 'PROPUESTA_VISUAL', titulo: 'Tienes una imagen nueva en tu propuesta', mensaje: 'Un profesional de AXORA preparó una imagen para tu propuesta de espacio.', enlace: '/disenador-espacios' });
    await audit(ctx, 'IMAGEN_MANUAL', 'PROPUESTA_ESPACIO', proposalId, { version: id }, conn);
    return id;
  });
  const detail = await getDetail(user, proposalId);
  return detail.versiones.find((version) => version.id === versionId);
}

async function analyzeProposal(ctx, proposalId, input) {
  if (!input.confirmar_envio) throw badRequest(`Debe autorizar el envío de la fotografía a ${aiProvider.label()}.`);
  const proposal = await getVisible(ctx.user, proposalId);
  if (proposal.solicitud_id) throw conflict('La propuesta ya está asociada a una solicitud.');
  const rows = await catalogRows();
  const selected = await normalizeServices(input.servicios, rows);
  const observations = minimizeText(input.observaciones, 1000);
  if (Buffer.byteLength(observations, 'utf8') > 950) {
    throw badRequest('Las observaciones son demasiado extensas. Redúzcalas para guardar la propuesta.');
  }
  const imagePath = safePath(proposal.fotografia_archivo);
  const image = await fs.promises.readFile(imagePath);
  if (!matchesSignature(image.subarray(0, 12), proposal.fotografia_mime)) {
    throw new AppError(500, 'INVALID_STORED_IMAGE', 'La fotografía guardada no coincide con su formato.');
  }
  aiProvider.assertConfigured();
  await recordConsent(ctx, proposalId);
  const raw = await aiProvider.analyze({
    image,
    mimeType: proposal.fotografia_mime,
    services: selected,
    observations,
    catalog: rows,
  });
  const analysis = cleanAnalysis(raw, rows, selected);
  const analysisJson = JSON.stringify(analysis);
  if (Buffer.byteLength(analysisJson, 'utf8') > 3900) throw new AppError(502, 'AI_INVALID_RESPONSE', `El análisis de ${aiProvider.label()} excede el tamaño permitido.`);
  await db.withTransaction(async (conn) => {
    const updated = await db.execute(
      `UPDATE PROPUESTAS_ESPACIO
          SET SERVICIOS_JSON = :servicios, OBSERVACIONES_CLIENTE = :observaciones,
              ANALISIS_JSON = :analisis, ESTADO = 'ANALIZADA', ACTUALIZADO_EN = SYSTIMESTAMP
        WHERE ID = :id AND ESTADO <> 'ELIMINADA' AND SOLICITUD_ID IS NULL`,
      {
        servicios: JSON.stringify(selected),
        observaciones,
        analisis: analysisJson,
        id: proposalId,
      },
      conn,
    );
    if (!updated.rowsAffected) throw conflict('La propuesta cambió mientras se analizaba. Vuelve a abrirla e inténtalo de nuevo.');
    await audit(ctx, 'ANALIZAR', 'PROPUESTA_ESPACIO', proposalId, null, conn);
  });
  return getDetail(ctx.user, proposalId);
}

function isManualAnalysis(analysis) { return analysis?.modo === 'MANUAL'; }

/**
 * Guarda una propuesta ELABORADA A MANO (sin IA): servicios, especificaciones, descripción y materiales escritos por el usuario.
 * Sirve cuando la IA no está configurada o falla. No genera ninguna imagen ni afirma que la fotografía fue analizada:
 * el análisis queda marcado con modo = 'MANUAL' y la solicitud de cotización adjunta solo la fotografía original.
 */
async function saveManual(ctx, proposalId, input) {
  const proposal = await getVisible(ctx.user, proposalId);
  if (proposal.solicitud_id) throw conflict('La propuesta ya está asociada a una solicitud.');
  const rows = await catalogRows();
  const selected = await normalizeServices(input.servicios, rows);
  const observations = minimizeText(input.observaciones, 1000);
  if (Buffer.byteLength(observations, 'utf8') > 950) {
    throw badRequest('Las observaciones son demasiado extensas. Redúzcalas para guardar la propuesta.');
  }
  const analysis = {
    modo: 'MANUAL',
    descripcion_espacio: 'Propuesta manual: el cliente describió la adecuación; la fotografía no fue analizada con IA.',
    elementos_visibles: [],
    adecuaciones: minimizeText(input.descripcion, 500),
    materiales_sugeridos: input.materiales.map((item) => minimizeText(item, 100)).filter(Boolean),
    observaciones: ['Propuesta elaborada manualmente: requiere inspección técnica y medidas verificadas por MS.'],
    recomendaciones: [],
  };
  const analysisJson = JSON.stringify(analysis);
  if (Buffer.byteLength(analysisJson, 'utf8') > 3900) throw badRequest('La descripción y los materiales son demasiado extensos.');
  await db.withTransaction(async (conn) => {
    const updated = await db.execute(
      `UPDATE PROPUESTAS_ESPACIO
          SET SERVICIOS_JSON = :servicios, OBSERVACIONES_CLIENTE = :observaciones,
              ANALISIS_JSON = :analisis, ESTADO = 'ANALIZADA', ACTUALIZADO_EN = SYSTIMESTAMP
        WHERE ID = :id AND ESTADO <> 'ELIMINADA' AND SOLICITUD_ID IS NULL`,
      { servicios: JSON.stringify(selected), observaciones: observations, analisis: analysisJson, id: proposalId },
      conn,
    );
    if (!updated.rowsAffected) throw conflict('La propuesta cambió mientras se guardaba. Vuelve a abrirla e inténtalo de nuevo.');
    await audit(ctx, 'PROPUESTA_MANUAL', 'PROPUESTA_ESPACIO', proposalId, null, conn);
  });
  return getDetail(ctx.user, proposalId);
}

function decodeGeneratedImage(result) {
  const encoded = String(result.data || '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 22 * 1024 * 1024) {
    throw new AppError(502, 'AI_INVALID_IMAGE', `${aiProvider.label()} devolvió datos de imagen inválidos.`);
  }
  const buffer = Buffer.from(encoded, 'base64');
  const mimeType = ['image/jpeg', 'image/png', 'image/webp'].find((type) => matchesSignature(buffer.subarray(0, 12), type));
  if (!buffer.length || buffer.toString('base64') !== encoded || !mimeType || (result.mimeType && result.mimeType !== mimeType)) {
    throw new AppError(502, 'AI_INVALID_IMAGE', 'La imagen generada no coincide con su formato declarado.');
  }
  if (buffer.length > 16 * 1024 * 1024) throw new AppError(502, 'AI_IMAGE_TOO_LARGE', `${aiProvider.label()} devolvió una imagen demasiado grande.`);
  return { buffer, mimeType };
}

async function generateVersion(ctx, proposalId, consent) {
  if (consent !== true) throw badRequest(`Debe autorizar el envío de la fotografía a ${aiProvider.label()}.`);
  const proposal = await getVisible(ctx.user, proposalId);
  if (proposal.solicitud_id) throw conflict('La propuesta ya está asociada a una solicitud.');
  if (!proposal.analisis_json || !proposal.servicios_json) throw badRequest('Analice la fotografía y seleccione los servicios antes de generar una propuesta.');
  const analysis = parseJson(proposal.analisis_json, 'el análisis');
  const services = parseJson(proposal.servicios_json, 'los servicios');
  const original = await fs.promises.readFile(safePath(proposal.fotografia_archivo));
  if (!matchesSignature(original.subarray(0, 12), proposal.fotografia_mime)) {
    throw new AppError(500, 'INVALID_STORED_IMAGE', 'La fotografía guardada no coincide con su formato.');
  }
  aiProvider.assertConfigured();
  await recordConsent(ctx, proposalId);
  const generated = await aiProvider.generateImage({
    image: original,
    mimeType: proposal.fotografia_mime,
    services,
    observations: proposal.observaciones_cliente,
    analysis,
  });
  const { buffer, mimeType } = decodeGeneratedImage(generated);
  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mimeType];
  const filename = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(UPLOAD_ROOT, String(new Date().getFullYear()), filename);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer, { flag: 'wx' });
  const relative = relativePath(fullPath);
  try {
    const versionId = await db.withTransaction(async (conn) => {
      const locked = await db.queryOne(
        'SELECT ESTADO, SOLICITUD_ID FROM PROPUESTAS_ESPACIO WHERE ID = :id FOR UPDATE',
        { id: proposalId },
        conn,
      );
      if (!locked || locked.estado === 'ELIMINADA') throw notFound('Propuesta');
      if (locked.solicitud_id) throw conflict('La propuesta ya está asociada a una solicitud.');
      const next = await db.queryOne(
        'SELECT NVL(MAX(NUMERO), 0) + 1 AS NUMERO FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id',
        { id: proposalId },
        conn,
      );
      const result = await db.execute(
        `INSERT INTO PROPUESTA_ESPACIO_VERSIONES
           (PROPUESTA_ID, NUMERO, IMAGEN_ARCHIVO, IMAGEN_MIME, IMAGEN_TAMANO, DESCRIPCION,
            MATERIALES_JSON, OBSERVACIONES_JSON, RECOMENDACIONES_JSON, MODELO)
         VALUES (:proposal, :numero, :archivo, :mime, :tamano, :descripcion,
           :materiales, :observaciones, :recomendaciones, :modelo)
         RETURNING ID INTO :out_id`,
        {
          proposal: proposalId,
          numero: next.numero,
          archivo: relative,
          mime: mimeType,
          tamano: buffer.length,
          descripcion: analysis.adecuaciones,
          materiales: JSON.stringify(analysis.materiales_sugeridos),
          observaciones: JSON.stringify(analysis.observaciones),
          recomendaciones: JSON.stringify(analysis.recomendaciones),
          modelo: aiProvider.imageModel(),
          out_id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
        },
        conn,
      );
      const id = result.outBinds.out_id[0];
      for (const service of services) {
        await db.execute(
          `INSERT INTO PROPUESTA_ESPACIO_SERVICIOS
             (VERSION_ID, SERVICIO_ID, CLAVE, CODIGO, NOMBRE, ESPECIFICACIONES)
           VALUES (:version, :servicio, :clave, :codigo, :nombre, :especificaciones)`,
          {
            version: id,
            servicio: service.servicio_id,
            clave: service.clave,
            codigo: service.codigo,
            nombre: service.nombre,
            especificaciones: service.especificaciones || null,
          },
          conn,
        );
      }
      await db.execute(
        `UPDATE PROPUESTAS_ESPACIO
            SET ESTADO = 'LISTA', CONSENTIMIENTO_GEMINI_EN = SYSTIMESTAMP, ACTUALIZADO_EN = SYSTIMESTAMP
          WHERE ID = :id`,
        { id: proposalId },
        conn,
      );
      await audit(ctx, 'GENERAR_VERSION', 'PROPUESTA_ESPACIO', proposalId, { version: id }, conn);
      return id;
    });
    const detail = await getDetail(ctx.user, proposalId);
    return detail.versiones.find((version) => version.id === versionId);
  } catch (error) {
    try {
      await fs.promises.unlink(fullPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('[ia espacios] no se pudo limpiar una imagen no persistida:', cleanupError.message);
    }
    throw error;
  }
}

async function recordConsent(ctx, proposalId) {
  await db.withTransaction(async (conn) => {
    const updated = await db.execute(
      `UPDATE PROPUESTAS_ESPACIO
          SET CONSENTIMIENTO_GEMINI_EN = SYSTIMESTAMP, ACTUALIZADO_EN = SYSTIMESTAMP
        WHERE ID = :id AND ESTADO <> 'ELIMINADA' AND SOLICITUD_ID IS NULL`,
      { id: proposalId },
      conn,
    );
    if (!updated.rowsAffected) throw conflict(`La propuesta cambió antes de enviar la imagen a ${aiProvider.label()}.`);
    await audit(ctx, 'CONSENTIR_ENVIO_GEMINI', 'PROPUESTA_ESPACIO', proposalId, null, conn);
  });
}

async function imageFor(user, proposalId, versionId = null) {
  const proposal = await getVisible(user, proposalId);
  if (versionId === null) {
    return {
      path: safePath(proposal.fotografia_archivo),
      mime: proposal.fotografia_mime,
      name: proposal.fotografia_nombre,
    };
  }
  const version = await db.queryOne(
    `SELECT IMAGEN_ARCHIVO, IMAGEN_MIME, NUMERO
       FROM PROPUESTA_ESPACIO_VERSIONES WHERE ID = :version AND PROPUESTA_ID = :proposal`,
    { version: versionId, proposal: proposalId },
  );
  if (!version) throw notFound('Imagen de propuesta');
  return {
    path: safePath(version.imagen_archivo),
    mime: version.imagen_mime,
    name: `propuesta-${proposalId}-version-${version.numero}`,
  };
}

async function createQuote(ctx, proposalId) {
  const user = ctx.user;
  const proposal = await getVisible(user, proposalId);
  if (proposal.solicitud_id) throw conflict('La propuesta ya tiene una solicitud de cotización.');
  const detail = await getDetail(user, proposalId);
  // Propuesta manual (sin IA): estado ANALIZADA con análisis marcado como MANUAL; se cotiza sin imagen generada
  const manual = proposal.estado === 'ANALIZADA' && isManualAnalysis(detail.analisis);
  if (!manual && proposal.estado !== 'LISTA') throw badRequest('Genere una propuesta visual o guarde una propuesta manual antes de solicitar la cotización.');
  const version = manual ? null : detail.versiones[0];
  if (!manual && !version) throw badRequest('La propuesta no tiene una imagen generada para adjuntar.');
  const services = manual ? (detail.servicios || []) : version.servicios;
  const materials = manual ? (detail.analisis.materiales_sugeridos || []) : version.materiales;
  const technical = manual ? (detail.analisis.observaciones || []) : version.observaciones;
  const description = [
    manual
      ? 'Solicitud de cotización generada a partir de una propuesta de adecuación elaborada manualmente (sin imagen generada por IA).'
      : 'Solicitud de cotización generada a partir de una propuesta conceptual de adecuación de espacio.',
    `Servicios seleccionados: ${services.map((item) => `${item.nombre}${item.especificaciones ? ` (${item.especificaciones})` : ''}`).join('; ')}.`,
    `Descripción: ${detail.analisis.adecuaciones}`,
    detail.observaciones_cliente ? `Observaciones del cliente: ${detail.observaciones_cliente}` : '',
    `Materiales ${manual ? 'indicados' : 'sugeridos'}: ${materials.join('; ') || (manual ? 'No especificados.' : 'No especificados por la IA.')}`,
    `Observaciones técnicas: ${technical.join('; ') || 'Requiere inspección técnica.'}`,
    `La propuesta ${manual ? 'fue elaborada a mano y ' : 'es conceptual; '}no incluye medidas verificadas ni precios definitivos. La cotización requiere revisión de MS Soluciones Tecnológicas.`,
  ].filter(Boolean).join('\n');
  if (Buffer.byteLength(description, 'utf8') > 3900) throw badRequest('La descripción de la solicitud excede el tamaño permitido.');

  const solicitudId = await db.withTransaction(async (conn) => {
    const companyScope = user.isClient ? 'AND EMPRESA_ID = :empresa' : '';
    const binds = user.isClient ? { id: proposalId, empresa: user.empresaId } : { id: proposalId };
    const locked = await db.queryOne(
      `SELECT ID, EMPRESA_ID, ESTADO, SOLICITUD_ID, ANALISIS_JSON, FOTOGRAFIA_ARCHIVO, FOTOGRAFIA_MIME, FOTOGRAFIA_NOMBRE
         FROM PROPUESTAS_ESPACIO WHERE ID = :id ${companyScope} FOR UPDATE`,
      binds,
      conn,
    );
    if (!locked || locked.estado === 'ELIMINADA') throw notFound('Propuesta');
    if (locked.solicitud_id) throw conflict('La propuesta ya tiene una solicitud de cotización.');
    const lockedManual = locked.estado === 'ANALIZADA' && isManualAnalysis(parseJson(locked.analisis_json, 'el análisis'));
    if (locked.estado !== 'LISTA' && !lockedManual) throw badRequest('Genere una nueva propuesta visual o guarde una propuesta manual antes de solicitar la cotización.');
    if (lockedManual !== manual) throw conflict('La propuesta cambió. Vuelve a cargarla antes de solicitar la cotización.');
    if (!manual) {
      const latestVersion = await db.queryOne(
        `SELECT ID FROM PROPUESTA_ESPACIO_VERSIONES
          WHERE PROPUESTA_ID = :id ORDER BY NUMERO DESC FETCH FIRST 1 ROWS ONLY`,
        { id: proposalId },
        conn,
      );
      if (!latestVersion || latestVersion.id !== version.id) {
        throw conflict('La propuesta cambió. Vuelve a cargarla antes de solicitar la cotización.');
      }
    }
    const createdId = await solicitudes.createRecord(ctx, {
      empresa_id: locked.empresa_id,
      categoria: 'OTRO',
      asunto: `Cotización de adecuación de espacio - propuesta ${proposalId}`,
      descripcion: description,
      prioridad: 'MEDIA',
    }, conn);
    const original = await imageForRecord(locked.fotografia_archivo, locked.fotografia_mime, locked.fotografia_nombre);
    const files = [original];
    if (!manual) {
      const versionRow = await db.queryOne(
        'SELECT IMAGEN_ARCHIVO, IMAGEN_MIME, NUMERO FROM PROPUESTA_ESPACIO_VERSIONES WHERE ID = :id',
        { id: version.id },
        conn,
      );
      if (!versionRow) throw notFound('Imagen de propuesta');
      const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[versionRow.imagen_mime];
      files.push(await imageForRecord(
        versionRow.imagen_archivo,
        versionRow.imagen_mime,
        `Propuesta visual versión ${version.numero}${extension}`,
      ));
    }
    for (const file of files) {
      await db.execute(
        `INSERT INTO ADJUNTOS
           (ENTIDAD, ENTIDAD_ID, EMPRESA_ID, TIPO, NOMBRE_ORIGINAL, NOMBRE_ARCHIVO, MIME, TAMANO, SUBIDO_POR)
         VALUES ('SOLICITUD', :sid, :empresa, 'ADJUNTO', :nombre, :archivo, :mime, :tamano, :usuario)`,
        {
          sid: createdId,
          empresa: locked.empresa_id,
          nombre: safeName(file.name),
          archivo: file.path,
          mime: file.mime,
          tamano: file.size,
          usuario: user.id,
        },
        conn,
      );
    }
    await db.execute(
      `UPDATE PROPUESTAS_ESPACIO
          SET SOLICITUD_ID = :solicitud, ESTADO = 'SOLICITUD_CREADA', ACTUALIZADO_EN = SYSTIMESTAMP
        WHERE ID = :id`,
      { solicitud: createdId, id: proposalId },
      conn,
    );
    await audit(ctx, 'SOLICITAR_COTIZACION', 'PROPUESTA_ESPACIO', proposalId, { solicitudId: createdId }, conn);
    return createdId;
  });
  return { solicitud_id: solicitudId, solicitud: await solicitudes.get(user, solicitudId) };
}

async function imageForRecord(file, mime, name) {
  const full = safePath(file);
  const stat = await fs.promises.stat(full);
  return { path: relativePath(full), mime, name, size: stat.size };
}

async function deleteProposal(ctx, proposalId) {
  await getVisible(ctx.user, proposalId);
  await db.withTransaction(async (conn) => {
    const companyScope = ctx.user.isClient ? 'AND EMPRESA_ID = :empresa' : '';
    const binds = ctx.user.isClient ? { id: proposalId, empresa: ctx.user.empresaId } : { id: proposalId };
    const locked = await db.queryOne(
      `SELECT ESTADO, SOLICITUD_ID, FOTOGRAFIA_ARCHIVO
         FROM PROPUESTAS_ESPACIO WHERE ID = :id ${companyScope} FOR UPDATE`,
      binds,
      conn,
    );
    if (!locked || locked.estado === 'ELIMINADA') throw notFound('Propuesta');
    if (locked.solicitud_id) throw conflict('La fotografía se conserva mientras exista una solicitud asociada.');
    const versions = await db.query(
      'SELECT IMAGEN_ARCHIVO FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id',
      { id: proposalId },
      conn,
    );
    const paths = [locked.fotografia_archivo, ...versions.map((row) => row.imagen_archivo)].filter(Boolean);
    for (const relative of paths) {
      try {
        await fs.promises.unlink(safePath(relative));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await db.execute('DELETE FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID = :id', { id: proposalId }, conn);
    await db.execute(
      `UPDATE PROPUESTAS_ESPACIO
          SET ESTADO = 'ELIMINADA', FOTOGRAFIA_ARCHIVO = NULL, FOTOGRAFIA_NOMBRE = NULL,
              FOTOGRAFIA_MIME = NULL, FOTOGRAFIA_TAMANO = NULL, SERVICIOS_JSON = NULL,
              OBSERVACIONES_CLIENTE = NULL, ANALISIS_JSON = NULL, CONSENTIMIENTO_GEMINI_EN = NULL,
              ACTUALIZADO_EN = SYSTIMESTAMP
        WHERE ID = :id`,
      { id: proposalId },
      conn,
    );
    await audit(ctx, 'ELIMINAR', 'PROPUESTA_ESPACIO', proposalId, null, conn);
  });
}

module.exports = {
  SERVICE_TYPES,
  analyzeSchema,
  manualSchema,
  saveManual,
  addProfessionalImage,
  catalog,
  createDraft,
  list,
  getDetail,
  analyzeProposal,
  generateVersion,
  imageFor,
  createQuote,
  deleteProposal,
};
