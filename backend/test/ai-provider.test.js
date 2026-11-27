// NOTA: usan un fetch SIMULADO. Validan selección de proveedor, armado de peticiones y manejo de errores;
// NO demuestran que Gemini u OpenAI respondan con una clave real.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const env = require('../src/config/env');
const aiProvider = require('../src/integrations/ai-provider');
const geminiSpace = require('../src/integrations/gemini-space');
const { diagnose } = require('../src/integrations/ai-diagnostics');

const realFetch = global.fetch;
const saved = { provider: env.ai.imageProvider, gm: env.ai.geminiModel, gk: env.ai.geminiApiKey, o: { ...env.ai.openai } };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const restore = () => { global.fetch = realFetch; env.ai.geminiModel = saved.gm; env.ai.imageProvider = saved.provider; env.ai.geminiApiKey = saved.gk; Object.assign(env.ai.openai, saved.o); };
const args = { image: png, mimeType: 'image/png', services: [], observations: '', catalog: [], analysis: {} };

test('selector: Gemini por defecto; OpenAI solo con AI_PROVIDER', () => {
  env.ai.imageProvider = 'gemini'; assert.equal(aiProvider.name(), 'gemini');
  env.ai.imageProvider = 'openai'; assert.equal(aiProvider.name(), 'openai'); assert.equal(aiProvider.label(), 'OpenAI');
  env.ai.imageProvider = 'otro'; assert.equal(aiProvider.name(), 'gemini'); restore();
});
test('openai: sin configuración no llama a la red', async () => {
  env.ai.imageProvider = 'openai'; Object.assign(env.ai.openai, { apiKey: '', textModel: '', imageModel: '' });
  let called = false; global.fetch = async () => { called = true; };
  await assert.rejects(aiProvider.generateImage(args), (e) => e.code === 'AI_NOT_CONFIGURED'); assert.equal(called, false); restore();
});
test('openai: edición con la foto original (multipart) y exige imagen real', async () => {
  env.ai.imageProvider = 'openai'; Object.assign(env.ai.openai, { apiKey: 'k-test', textModel: 't', imageModel: 'i' });
  let req; global.fetch = async (url, init) => { req = { url, init }; return { ok: true, async json() { return { data: [{ b64_json: png.toString('base64') }] }; } }; };
  const out = await aiProvider.generateImage({ ...args, services: [{ nombre: 'PVC', especificaciones: '' }], analysis: { descripcion_espacio: 'sala', adecuaciones: 'techo' } });
  assert.match(req.url, /\/v1\/images\/edits$/); assert.ok(req.init.body instanceof FormData);
  assert.equal(req.init.body.get('model'), 'i'); assert.match(String(req.init.body.get('prompt')), /Conserva la geometría/);
  assert.equal(req.init.headers.authorization, 'Bearer k-test'); assert.equal(out.mimeType, 'image/png');
  global.fetch = async () => ({ ok: true, async json() { return { data: [] }; } });
  await assert.rejects(aiProvider.generateImage(args), (e) => e.code === 'AI_NO_IMAGE'); restore();
});
test('openai: errores traducidos sin exponer texto crudo ni la clave', async () => {
  env.ai.imageProvider = 'openai'; Object.assign(env.ai.openai, { apiKey: 'k-secreta', textModel: 't', imageModel: 'i' });
  for (const [status, code] of [[401, 'AI_ACCESS_DENIED'], [404, 'AI_MODEL_UNAVAILABLE'], [429, 'AI_QUOTA_EXCEEDED']]) {
    global.fetch = async () => ({ ok: false, status, async json() { return { error: { message: 'detalle privado k-secreta' } }; } });
    await assert.rejects(aiProvider.analyze(args), (e) => e.code === code && !e.message.includes('detalle privado') && !e.message.includes('k-secreta') && e.details.http === status);
  }
  restore();
});
test('gemini: el 404 nombra el modelo real y no expone el texto del proveedor', async () => {
  env.ai.imageProvider = 'gemini'; env.ai.geminiApiKey = 'k-test';
  global.fetch = async () => ({ ok: false, status: 404, async json() { return { error: { status: 'NOT_FOUND', message: 'privado' } }; } });
  await assert.rejects(geminiSpace.analyze(args), (e) => e.code === 'AI_MODEL_UNAVAILABLE' && e.message.includes(env.ai.geminiModel) && !e.message.includes('privado')); restore();
});
test('diagnóstico: detecta modelo ausente de la lista de la clave y propone candidatos', async () => {
  env.ai.imageProvider = 'gemini'; env.ai.geminiApiKey = 'k-test'; env.ai.geminiModel = 'modelo-retirado';
  global.fetch = async () => ({ ok: true, status: 200, async json() { return { models: [
    { name: 'models/gemini-ejemplo-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-ejemplo-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-x', supportedGenerationMethods: ['embedContent'] }] }; } });
  const d = await diagnose();
  assert.equal(d.modelo_texto.aparece_en_lista, false); assert.ok(d.candidatos_texto.includes('gemini-ejemplo-flash')); assert.ok(d.candidatos_imagen.includes('gemini-ejemplo-image'));
  assert.match(d.conclusion, /NO aparece/); assert.ok(!JSON.stringify(d).includes('k-test'));
  global.fetch = async () => ({ ok: false, status: 403, async json() { return { error: { status: 'PERMISSION_DENIED', message: 'x' } }; } });
  assert.match((await diagnose()).conclusion, /rechazó la clave/); restore();
});
