const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, asCliente, asTecnico, start, token } = require('./helpers');
const env = require('../src/config/env');
const ai = require('../src/modules/ia/module');
const { userFromClaims } = require('../src/middleware/auth');

let api;
const originalFetch = global.fetch;
const originalApiKey = env.ai.geminiApiKey;

test.before(async () => { api = await start(); });
test.after(async () => {
  global.fetch = originalFetch;
  env.ai.geminiApiKey = originalApiKey;
  await api.close();
});
test.beforeEach(() => {
  fake.reset();
  global.fetch = originalFetch;
  env.ai.geminiApiKey = '';
});

test('minimiza correos, identificaciones y secuencias numéricas', () => {
  const cleaned = ai.minimizeText('Escribe a laura@demo.local, NIT 900123456-1 o llama al +57 300 123 4567');
  assert.doesNotMatch(cleaned, /laura@demo\.local|900123456|300 123 4567/i);
  assert.match(cleaned, /\[correo oculto\]/);
  assert.match(cleaned, /\[identificación ocultada\]/);
});

test('clasificación usa la clave en header, minimiza texto y valida la respuesta JSON', async (t) => {
  env.ai.geminiApiKey = 'test-secret-key';
  let requestUrl = '';
  let requestOptions;
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({
          categoria: 'REDES', prioridad: 'ALTA', explicacion: 'Se recomienda revisar la conectividad.' }) }] } }] };
      },
    };
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await ai.classify({
    categoria: 'OTRO',
    asunto: 'Falla en red',
    descripcion: 'Contactar a laura@demo.local en el 300 123 4567. No conecta.',
  });
  const payload = JSON.parse(requestOptions.body);
  const sentPrompt = payload.contents[0].parts[0].text;
  assert.equal(result.categoria, 'REDES');
  assert.equal(requestOptions.headers['x-goog-api-key'], 'test-secret-key');
  assert.ok(!requestUrl.includes('test-secret-key'));
  assert.doesNotMatch(sentPrompt, /laura@demo\.local|300 123 4567/);
});

test('diagnóstico devuelve una hipótesis y pasos sin exponer contacto', async (t) => {
  env.ai.geminiApiKey = 'test-secret-key';
  let prompt = '';
  global.fetch = async (url, options) => {
    prompt = JSON.parse(options.body).contents[0].parts[0].text;
    return {
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({
          diagnostico: 'Posible problema de conectividad.',
          pasos: ['Verificar el enlace físico.', 'Comprobar la configuración IP.'],
          respuesta_cliente: 'Un técnico validará la conexión.',
        }) }] } }] };
      },
    };
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await ai.diagnose({
    categoria: 'REDES',
    asunto: 'Sin conexión',
    descripcion: 'Llamar a 300 123 4567; el router no responde.',
  });
  assert.equal(result.pasos.length, 2);
  assert.doesNotMatch(prompt, /300 123 4567/);
});

test('chat limita las consultas a la empresa del token y omite borradores', async (t) => {
  env.ai.geminiApiKey = 'test-secret-key';
  fake.on(/FROM SOLICITUDES S/, (sql, binds) => {
    assert.equal(binds.s_empresa_id, 10);
    return { rows: [{ CODIGO: 'SOL-000001', CATEGORIA: 'REDES', ASUNTO: 'Falla', DESCRIPCION: 'No conecta', ESTADO: 'NUEVA', PRIORIDAD: 'MEDIA' }] };
  });
  fake.on(/FROM COTIZACIONES C/, (sql, binds) => {
    assert.equal(binds.s_empresa_id, 10);
    assert.match(sql, /C\.ESTADO <> :n_estado/);
    return { rows: [{ CODIGO: 'COT-000001', ESTADO: 'ENVIADA', TOTAL: 100000, NOTAS: null }] };
  });
  fake.on(/FROM SERVICIOS S/, () => ({ rows: [{ CODIGO: 'RED-001', LINEA: 'REDES', NOMBRE: 'Instalación de red', DESCRIPCION: 'Cableado', PRECIO_BASE: 100000 }] }));
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.contents[0].parts[0].text, /SOL-000001/);
    return { ok: true, async json() { return { candidates: [{ content: { parts: [{ text: 'Hay una solicitud pendiente.' }] } }] }; } };
  };
  t.after(() => { global.fetch = originalFetch; });

  const user = userFromClaims({
    sub: '100', roles: ['CLIENTE'], perms: ['solicitudes:read', 'cotizaciones:read', 'servicios:read'], emp: 10,
  });
  const result = await ai.chat(user, { pregunta: '¿Cuál es el estado de mi solicitud?', historial: [] });
  assert.equal(result.respuesta, 'Hay una solicitud pendiente.');
  assert.deepEqual(result.contexto, { solicitudes: 1, cotizaciones: 1, servicios: 1 });
  assert.ok(fake.calls.some((call) => /FROM SOLICITUDES S/.test(call.sql) && call.binds.s_empresa_id === 10));
});

test('IA devuelve estado sin clave y las acciones no hacen llamadas al proveedor', async () => {
  const status = await api.call('GET', '/api/ia/estado', { token: asCliente() });
  assert.equal(status.status, 200);
  assert.equal(status.body.configurada, false);

  const result = await api.call('POST', '/api/ia/clasificar', {
    token: asCliente(),
    body: { categoria: 'REDES', asunto: 'Sin conexión', descripcion: 'No hay internet' },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'AI_NOT_CONFIGURED');

  let called = false;
  global.fetch = async () => { called = true; throw new Error('No debe llamar al proveedor'); };
  await assert.rejects(
    ai.classify({ categoria: 'REDES', asunto: 'Sin conexión', descripcion: 'No hay internet' }),
    (error) => error.code === 'AI_NOT_CONFIGURED',
  );
  assert.equal(called, false);
});

test('permisos de IA se validan en backend y solicitudes inválidas dan 400', async () => {
  const body = { categoria: 'REDES', asunto: 'Falla', descripcion: 'No conecta' };
  const denied = await api.call('POST', '/api/ia/clasificar', { token: asTecnico(), body });
  assert.equal(denied.status, 403);

  const diagnosisDenied = await api.call('POST', '/api/ia/diagnostico', { token: asCliente(), body });
  assert.equal(diagnosisDenied.status, 403);

  const invalid = await api.call('POST', '/api/ia/clasificar', {
    token: asCliente(), body: { ...body, categoria: 'NO_EXISTE' },
  });
  assert.equal(invalid.status, 400);
});
