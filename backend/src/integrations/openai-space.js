/**
 * Adaptador OpenAI del Diseñador de espacios (alternativa a Gemini; se activa con AI_PROVIDER=openai).
 * Análisis: Chat Completions con imagen + JSON. Edición: Images API /v1/images/edits con la foto original.
 * Los nombres de modelo NO se asumen: vienen de OPENAI_MODEL y OPENAI_IMAGE_MODEL. Es de pago por uso.
 */
const env = require('../config/env');
const { AppError } = require('../core/errors');
const { SYSTEM_INSTRUCTION, analysisPrompt, imagePrompt } = require('./space-prompts');

const BASE = 'https://api.openai.com/v1';
const cfg = () => env.ai.openai;

function assertConfigured() {
  const c = cfg();
  if (!c.apiKey.trim()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Configure OPENAI_API_KEY en backend/.env para usar OpenAI.');
  if (!c.textModel.trim() || !c.imageModel.trim()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Configure OPENAI_MODEL y OPENAI_IMAGE_MODEL en backend/.env.');
}
const safe = (m) => { const key = cfg().apiKey.trim(); let t = String(m || '').replace(/\s+/g, ' ').slice(0, 300); if (key) t = t.split(key).join('[clave]'); return t; };
const FAILURES = {
  401: ['AI_ACCESS_DENIED', 'OpenAI rechazó la clave OPENAI_API_KEY.'],
  403: ['AI_ACCESS_DENIED', 'OpenAI no autoriza este modelo o recurso para su organización (la edición de imágenes puede requerir verificación de la organización).'],
  404: ['AI_MODEL_UNAVAILABLE', 'El modelo configurado no existe o no está disponible para esta clave.'],
  429: ['AI_QUOTA_EXCEEDED', 'Se alcanzó el límite o la cuota de OpenAI. Revise saldo y límites de la cuenta.'],
};

async function call(path, init, timeoutMs, label, model) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${cfg().apiKey}` }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new AppError(timedOut ? 504 : 502, timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', timedOut ? `OpenAI tardó demasiado en ${label}.` : `No fue posible conectar con OpenAI para ${label}.`);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = safe((await response.json())?.error?.message); } catch { /* sin cuerpo */ }
    console.error(`[openai espacios] ${label} · modelo ${model}: HTTP ${response.status}${detail ? ` · ${detail}` : ''}`);
    const [code, msg] = FAILURES[response.status] || (response.status >= 500 ? ['AI_PROVIDER_UNAVAILABLE', 'OpenAI presenta una falla temporal.'] : ['AI_REQUEST_REJECTED', 'OpenAI rechazó la solicitud.']);
    throw new AppError(502, code, `${msg} (HTTP ${response.status}, modelo "${model}")`, { proveedor: 'openai', http: response.status, modelo: model });
  }
  try { return await response.json(); } catch { throw new AppError(502, 'AI_INVALID_RESPONSE', 'OpenAI devolvió una respuesta inválida.'); }
}

async function analyze({ image, mimeType, services, observations, catalog }) {
  assertConfigured();
  const data = await call('/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    model: cfg().textModel, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, { role: 'user', content: [
      { type: 'text', text: analysisPrompt({ services, observations, catalog }) },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image.toString('base64')}` } } ] }],
  }) }, cfg().timeoutMs, 'analizar la fotografía', cfg().textModel);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError(502, 'AI_EMPTY_RESPONSE', 'OpenAI no devolvió el análisis de la fotografía.');
  try { return JSON.parse(text); } catch { throw new AppError(502, 'AI_INVALID_RESPONSE', 'OpenAI devolvió un análisis con formato inválido.'); }
}

async function generateImage({ image, mimeType, services, observations, analysis }) {
  assertConfigured();
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType] || 'png';
  const form = new FormData();
  form.append('model', cfg().imageModel);
  form.append('prompt', imagePrompt({ services, observations, analysis }));
  form.append('image', new Blob([image], { type: mimeType }), `espacio.${ext}`);
  form.append('size', cfg().imageSize);
  form.append('quality', cfg().imageQuality);
  const data = await call('/images/edits', { method: 'POST', headers: {}, body: form }, cfg().imageTimeoutMs, 'generar la propuesta visual', cfg().imageModel);
  const out = data?.data?.[0];
  if (!out?.b64_json) throw new AppError(502, 'AI_NO_IMAGE', 'OpenAI no devolvió una imagen de propuesta. No se guardó una versión.');
  return { data: out.b64_json, mimeType: 'image/png' };
}
module.exports = { assertConfigured, analyze, generateImage };
