const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fake, asCliente, asTecnico, start } = require('./helpers');
const env = require('../src/config/env');
const { UPLOAD_ROOT } = require('../src/middleware/upload');
const geminiSpace = require('../src/integrations/gemini-space');

const originalFetch = global.fetch;
const originalApiKey = env.ai.geminiApiKey;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
let api;
const storedPhotos = [];

function configureProposalDb() {
  let proposal = null;
  fake.on(/SELECT ID FROM EMPRESAS/, () => ({ rows: [{ ID: 10 }] }));
  fake.on(/INSERT INTO PROPUESTAS_ESPACIO/, (_sql, binds) => {
    proposal = {
      ID: 7,
      EMPRESA_ID: binds.empresa,
      CREADO_POR: binds.usuario,
      ESTADO: 'BORRADOR',
      FOTOGRAFIA_ARCHIVO: binds.archivo,
      FOTOGRAFIA_NOMBRE: binds.nombre,
      FOTOGRAFIA_MIME: binds.mime,
      FOTOGRAFIA_TAMANO: binds.tamano,
      SERVICIOS_JSON: null,
      OBSERVACIONES_CLIENTE: null,
      ANALISIS_JSON: null,
      SOLICITUD_ID: null,
      CREADO_EN: new Date().toISOString(),
    };
    storedPhotos.push(path.resolve(UPLOAD_ROOT, binds.archivo));
    return { outBinds: { out_id: [7] }, rowsAffected: 1 };
  });
  fake.on(/SELECT \* FROM PROPUESTAS_ESPACIO WHERE ID/, (_sql, binds) => {
    if (!proposal || proposal.ID !== binds.id || (binds.empresa && proposal.EMPRESA_ID !== binds.empresa) || proposal.ESTADO === 'ELIMINADA') {
      return { rows: [] };
    }
    return { rows: [proposal] };
  });
  fake.on(/FROM PROPUESTA_ESPACIO_VERSIONES V/, () => ({ rows: [] }));
  fake.on(/FROM PROPUESTA_ESPACIO_VERSIONES WHERE PROPUESTA_ID/, () => ({ rows: [] }));
  fake.on(/FROM PROPUESTA_ESPACIO_SERVICIOS/, () => ({ rows: [] }));
}

function imageForm(content = png, mime = 'image/png') {
  const form = new FormData();
  form.append('fotografia', new Blob([content], { type: mime }), 'espacio.png');
  return form;
}

test.before(async () => { api = await start(); });
test.after(async () => {
  global.fetch = originalFetch;
  env.ai.geminiApiKey = originalApiKey;
  for (const storedPhoto of storedPhotos) {
    try { await fs.promises.unlink(storedPhoto); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await api.close();
});
test.beforeEach(() => {
  fake.reset();
  global.fetch = originalFetch;
  env.ai.geminiApiKey = '';
});

test('el diseñador exige autenticación y permiso de creación de solicitudes', async () => {
  const unauthenticated = await api.call('GET', '/api/ia/espacios');
  assert.equal(unauthenticated.status, 401);
  // El técnico puede LEER (catálogo y propuestas manuales) para mostrar imágenes al cliente, pero no crear propuestas.
  const technician = await api.call('GET', '/api/ia/espacios/catalogo', { token: asTecnico() });
  assert.equal(technician.status, 200);
  const body = new FormData();
  body.append('fotografia', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: 'image/png' }), 'a.png');
  const create = await api.call('POST', '/api/ia/espacios', { token: asTecnico(), body });
  assert.equal(create.status, 403);
});

test('el catálogo del diseñador devuelve precios y relaciona PVC, paneles y cámara con códigos activos', async () => {
  fake.on(/SELECT ID, CODIGO, LINEA, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD\s+FROM SERVICIOS/, () => ({
    rows: [
      { ID: 1, CODIGO: 'ADE-001', LINEA: 'ADECUACIONES', NOMBRE: 'PVC/WPC de pared', DESCRIPCION: 'Panel marmolizado', PRECIO_BASE: 50000, UNIDAD: 'metro' },
      { ID: 2, CODIGO: 'ADE-002', LINEA: 'ADECUACIONES', NOMBRE: 'PVC en techos', DESCRIPCION: 'Cielo raso PVC', PRECIO_BASE: 60000, UNIDAD: 'metro' },
      { ID: 3, CODIGO: 'ADE-004', LINEA: 'ADECUACIONES', NOMBRE: 'Puntos eléctricos', DESCRIPCION: 'Instalación de punto', PRECIO_BASE: 40000, UNIDAD: 'punto' },
      { ID: 4, CODIGO: 'RED-001', LINEA: 'REDES', NOMBRE: 'Instalación de redes', DESCRIPCION: 'Redes', PRECIO_BASE: 100000, UNIDAD: 'servicio' },
      { ID: 5, CODIGO: 'CCT-001', LINEA: 'CCTV', NOMBRE: 'Cámara en poste', DESCRIPCION: 'Instalación', PRECIO_BASE: 100000, UNIDAD: 'servicio' },
    ],
  }));
  const response = await api.call('GET', '/api/ia/espacios/catalogo', { token: asCliente() });
  assert.equal(response.status, 200);
  const option = (clave) => response.body.opciones.find((item) => item.clave === clave);
  assert.equal(option('CIELO_PVC').catalogo.codigo, 'ADE-002');
  assert.equal(option('CIELO_PVC').catalogo.precio_base, 60000);
  assert.equal(option('PANELES_DECORATIVOS').catalogo.unidad, 'metro');
  assert.equal(option('CAMARAS_SEGURIDAD').catalogo.codigo, 'CCT-001');
  assert.equal(response.body.servicios.find((item) => item.codigo === 'RED-001').precio_base, 100000);
});

test('la carga acepta solo firmas de imagen y no guarda un archivo inválido', async () => {
  configureProposalDb();
  const response = await api.call('POST', '/api/ia/espacios', { token: asCliente(), body: imageForm(Buffer.from('not an image')) });
  assert.equal(response.status, 400);
  assert.equal(fake.calls.some((item) => /INSERT INTO PROPUESTAS_ESPACIO/.test(item.sql)), false);
});

test('la fotografía se guarda en borrador, queda aislada por empresa y no se llama a Gemini sin clave', async () => {
  configureProposalDb();
  let providerCalled = false;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      providerCalled = true;
      throw new Error('No debe llamar al proveedor sin clave');
    }
    return originalFetch(url, options);
  };

  const created = await api.call('POST', '/api/ia/espacios', { token: asCliente(), body: imageForm() });
  assert.equal(created.status, 201);
  assert.equal(created.body.estado, 'BORRADOR');
  assert.equal(created.body.analisis, null);
  assert.ok(fs.existsSync(storedPhotos.at(-1)));

  const foreign = await api.call('GET', '/api/ia/espacios/7', { token: asCliente(11) });
  assert.equal(foreign.status, 404);
  assert.ok(fake.calls.some((item) => /SELECT \* FROM PROPUESTAS_ESPACIO/.test(item.sql) && item.binds.empresa === 11));

  const noKey = await api.call('POST', '/api/ia/espacios/7/analizar', {
    token: asCliente(),
    body: { confirmar_envio: true, servicios: [{ clave: 'CIELO_PVC', especificaciones: 'Acabado blanco' }], observaciones: '' },
  });
  assert.equal(noKey.status, 503);
  assert.equal(noKey.body.error.code, 'AI_NOT_CONFIGURED');
  assert.equal(providerCalled, false);
});

test('la edición de imagen requiere una salida real y desactiva el almacenamiento de interacciones', async () => {
  env.ai.geminiApiKey = 'test-secret-key';
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, async json() { return { outputs: [{ type: 'text', text: 'No se generó imagen.' }] }; } };
  };
  await assert.rejects(
    geminiSpace.generateImage({
      image: png,
      mimeType: 'image/png',
      services: [{ nombre: 'Cielo raso PVC', especificaciones: 'Blanco' }],
      observations: '',
      analysis: { descripcion_espacio: 'Espacio interior', adecuaciones: 'Cielo PVC' },
    }),
    (error) => error.code === 'AI_NO_IMAGE' && error.status === 502,
  );
  assert.equal(request.model, env.ai.geminiImageModel);
  assert.equal(request.store, false);
  assert.equal(request.input[1].mime_type, 'image/png');
  assert.equal(request.input[1].data, png.toString('base64'));
  assert.match(request.input[0].text, /Cielo raso PVC/);
  assert.match(request.input[0].text, /Blanco/);
  assert.match(request.input[0].text, /Aplica exclusivamente los servicios seleccionados/);
});

test('el proveedor explica errores de cuota, permisos y modelo sin exponer su respuesta original', async () => {
  env.ai.geminiApiKey = 'test-secret-key';
  const cases = [
    { status: 429, providerStatus: 'RESOURCE_EXHAUSTED', code: 'AI_QUOTA_EXCEEDED', message: /cuota de Gemini/ },
    { status: 403, providerStatus: 'PERMISSION_DENIED', code: 'AI_ACCESS_DENIED', message: /Google rechazó la clave/ },
    { status: 404, providerStatus: 'NOT_FOUND', code: 'AI_MODEL_UNAVAILABLE', message: /el modelo ".*" no existe o no está disponible para esta clave/ },
  ];

  for (const item of cases) {
    global.fetch = async () => ({
      ok: false,
      status: item.status,
      async json() { return { error: { status: item.providerStatus, message: 'detalle privado del proveedor' } }; },
    });
    await assert.rejects(
      geminiSpace.analyze({ image: png, mimeType: 'image/png', services: [], observations: '', catalog: [] }),
      (error) => error.status === 502
        && error.code === item.code
        && item.message.test(error.message)
        && !error.message.includes('detalle privado del proveedor')
        && !JSON.stringify(error.details || {}).includes('detalle privado del proveedor')
        && (item.status !== 404 || (error.details.http === 404 && error.details.modelo === env.ai.geminiModel)),
    );
  }
});

test('el análisis entrega a Gemini el precio base y la unidad del catálogo sin usarlos como cotización final', async () => {
  env.ai.geminiApiKey = 'test-secret-key';
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({
          descripcion_espacio: 'Habitación',
          elementos_visibles: ['techo'],
          adecuaciones: 'Techo en PVC',
          materiales_sugeridos: ['PVC'],
          observaciones: [],
          recomendaciones: [],
        }) }] } }] };
      },
    };
  };
  await geminiSpace.analyze({
    image: png,
    mimeType: 'image/png',
    services: [{ nombre: 'Instalación de PVC en techos', especificaciones: '', codigo: 'ADE-002' }],
    observations: '',
    catalog: [{ codigo: 'ADE-002', nombre: 'Instalación de PVC en techos', descripcion: 'PVC en techos', precio_base: 60000, unidad: 'metro' }],
  });
  const prompt = request.contents[0].parts[0].text;
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.match(prompt, /"precioBase":60000/);
  assert.match(prompt, /"unidad":"metro"/);
  assert.match(prompt, /No inventes ni calcules precios/);
});
