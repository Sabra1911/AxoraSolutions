/**
 * Diagnóstico REAL del proveedor de IA: ¿existe la clave?, ¿qué modelos admite ESTA clave (ListModels)?,
 * ¿aparece el modelo configurado?, y con probar=1 una llamada mínima de texto. Nunca devuelve la clave.
 * Solo lo consulta un administrador (ruta en modules/ia/module.js). No genera imágenes ni gasta cuota de imagen.
 */
const env = require('../config/env');
const aiProvider = require('./ai-provider');
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const short = (m) => String(m || '').replace(/\s+/g, ' ').slice(0, 300);

async function httpJson(url, init, timeoutMs = 20000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    let body = null; try { body = await r.json(); } catch { /* sin JSON */ }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, networkError: e?.name === 'TimeoutError' ? 'Tiempo de espera agotado al contactar al proveedor' : 'No hay conexión con el proveedor desde el servidor' };
  }
}
async function geminiModels() {
  const key = env.ai.geminiApiKey.trim(); const all = []; let token = '';
  for (let page = 0; page < 10; page++) {
    const r = await httpJson(`${GEMINI_BASE}/models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { headers: { 'x-goog-api-key': key } });
    if (!r.ok) return { error: { http: r.status, estado: r.body?.error?.status || null, mensaje: r.networkError || short(r.body?.error?.message) } };
    all.push(...(r.body?.models || [])); token = r.body?.nextPageToken || ''; if (!token) break;
  }
  return { models: all.map((m) => ({ nombre: String(m.name || '').replace(/^models\//, ''), metodos: m.supportedGenerationMethods || [] })) };
}
function check(configured, models, method) {
  const f = models.find((m) => m.nombre === configured);
  return { configurado: configured || null, aparece_en_lista: !!f, admite_metodo: f ? f.metodos.includes(method) : null, metodo_requerido: method };
}
async function diagnoseGemini(probe) {
  const out = { proveedor: 'gemini', clave_configurada: !!env.ai.geminiApiKey.trim() };
  if (!out.clave_configurada) { out.conclusion = 'Falta GEMINI_API_KEY en backend/.env.'; return out; }
  const listed = await geminiModels();
  if (listed.error) {
    out.lista_modelos = { ok: false, ...listed.error };
    out.conclusion = [400, 401, 403].includes(listed.error.http) ? 'Google rechazó la clave al listar modelos: verifique GEMINI_API_KEY y que la API Generative Language esté habilitada.' : `No se pudo listar los modelos (${listed.error.mensaje || `HTTP ${listed.error.http}`}).`;
    return out;
  }
  const { models } = listed;
  out.lista_modelos = { ok: true, total: models.length };
  out.modelo_texto = check(env.ai.geminiModel, models, 'generateContent');
  out.modelo_imagen = { ...check(env.ai.geminiImageModel, models, 'generateContent'), nota: 'El diseñador genera imágenes con la Interactions API; ese modelo podría no figurar en ListModels aunque funcione. Si falla con 404, pruebe un candidato.' };
  const names = (re) => models.filter((m) => re.test(m.nombre) && m.metodos.includes('generateContent')).map((m) => m.nombre);
  out.candidatos_texto = names(/flash|pro/i).filter((n) => !/image|tts|audio|embedding|live/i.test(n)).slice(0, 12);
  out.candidatos_imagen = names(/image/i).slice(0, 12);
  if (probe) {
    const t0 = Date.now();
    const r = await httpJson(`${GEMINI_BASE}/models/${encodeURIComponent(env.ai.geminiModel)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.ai.geminiApiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde únicamente: OK' }] }], generationConfig: { maxOutputTokens: 8 } }) }, 30000);
    out.prueba_texto = { ok: r.ok, http: r.status, estado: r.body?.error?.status || null, mensaje: r.networkError || short(r.body?.error?.message) || null, ms: Date.now() - t0 };
  }
  const t = out.modelo_texto;
  out.conclusion = !t.aparece_en_lista ? `El modelo de texto "${t.configurado}" NO aparece entre los modelos disponibles para esta clave. Use uno de candidatos_texto en GEMINI_MODEL.` : t.admite_metodo === false ? `El modelo "${t.configurado}" existe pero no admite generateContent.` : 'El modelo de texto está disponible para esta clave.';
  return out;
}
async function diagnoseOpenai() {
  const c = env.ai.openai;
  const out = { proveedor: 'openai', clave_configurada: !!c.apiKey.trim(), modelo_texto: { configurado: c.textModel || null }, modelo_imagen: { configurado: c.imageModel || null } };
  if (!out.clave_configurada) { out.conclusion = 'Falta OPENAI_API_KEY en backend/.env.'; return out; }
  const r = await httpJson('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${c.apiKey}` } });
  if (!r.ok) { out.lista_modelos = { ok: false, http: r.status, mensaje: r.networkError || short(r.body?.error?.message) }; out.conclusion = 'OpenAI no pudo listar los modelos con esta clave.'; return out; }
  const ids = (r.body?.data || []).map((m) => m.id);
  out.lista_modelos = { ok: true, total: ids.length };
  out.modelo_texto.aparece_en_lista = ids.includes(c.textModel); out.modelo_imagen.aparece_en_lista = ids.includes(c.imageModel);
  out.candidatos_imagen = ids.filter((i) => /image/i.test(i)).slice(0, 12);
  out.conclusion = out.modelo_texto.aparece_en_lista && out.modelo_imagen.aparece_en_lista ? 'Ambos modelos aparecen para esta clave.' : 'Alguno de los modelos configurados no aparece para esta clave.';
  return out;
}
async function diagnose({ probe = false } = {}) {
  const name = aiProvider.name();
  const result = name === 'openai' ? await diagnoseOpenai() : await diagnoseGemini(probe);
  return { ...result, proveedor_activo: name, nota: 'Respuestas reales del proveedor en este momento.' };
}
module.exports = { diagnose };
