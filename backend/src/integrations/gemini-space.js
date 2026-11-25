const env = require('../config/env');
const { AppError } = require('../core/errors');
const gemini = require('./gemini');

const { SYSTEM_INSTRUCTION, analysisPrompt, imagePrompt } = require('./space-prompts');

/** Mensaje del proveedor sin la clave; solo se escribe en el log del servidor. */
function safeProviderMessage(message) {
  const key = env.ai.geminiApiKey.trim();
  let text = String(message || '').replace(/\s+/g, ' ').slice(0, 300);
  if (key) text = text.split(key).join('[clave]');
  return text;
}

function providerFailure(status, providerStatus, { model = '' } = {}) {
  if ([401, 403].includes(status) || providerStatus === 'PERMISSION_DENIED') {
    return {
      code: 'AI_ACCESS_DENIED',
      message: 'Google rechazó la clave o no autorizó el modelo. Revise la clave GEMINI_API_KEY y los permisos del proyecto en Google AI Studio.',
    };
  }
  if (status === 404 || providerStatus === 'NOT_FOUND') {
    return {
      code: 'AI_MODEL_UNAVAILABLE',
      message: `Google respondió 404: el modelo "${model}" no existe o no está disponible para esta clave. `
        + 'Un administrador puede consultar GET /api/ia/diagnostico-proveedor para ver los modelos que sí admite la clave y actualizar GEMINI_MODEL o GEMINI_IMAGE_MODEL en backend/.env.',
    };
  }
  if (status === 429 || providerStatus === 'RESOURCE_EXHAUSTED') {
    return {
      code: 'AI_QUOTA_EXCEEDED',
      message: 'Se alcanzó el límite o la cuota de Gemini. Revise los límites y la facturación de Google AI Studio antes de volver a intentarlo.',
    };
  }
  if (status === 400 || providerStatus === 'INVALID_ARGUMENT') {
    return {
      code: 'AI_REQUEST_REJECTED',
      message: 'Gemini rechazó la solicitud. Revise el formato de la fotografía y que el modelo admita análisis de imágenes.',
    };
  }
  if (status >= 500) {
    return {
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Gemini presenta una falla temporal. Espere unos minutos y vuelva a intentarlo.',
    };
  }
  return {
    code: 'AI_PROVIDER_ERROR',
    message: 'Gemini no pudo completar la solicitud. Revise la configuración del proveedor e intente de nuevo.',
  };
}

async function providerJson(url, options, timeoutMs, label, model = '') {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new AppError(timedOut ? 504 : 502, timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE',
      timedOut ? `Gemini tardó demasiado en ${label}. Intente de nuevo.` : `No fue posible conectar con Gemini para ${label}.`);
  }
  if (!response.ok) {
    let providerStatus = '';
    let detail = '';
    try {
      const body = await response.json();
      providerStatus = String(body?.error?.status || '');
      detail = safeProviderMessage(body?.error?.message);
    } catch {
      console.error(`[gemini espacios] ${label}: no se pudo leer el código de error del proveedor`);
    }
    console.error(`[gemini espacios] ${label} · modelo ${model || '?'}: HTTP ${response.status}${providerStatus ? ` (${providerStatus})` : ''}${detail ? ` · ${detail}` : ''}`);
    const failure = providerFailure(response.status, providerStatus, { model });
    // 'details' conserva datos reales y no sensibles (HTTP, estado y modelo) para mostrar la causa verdadera
    throw new AppError(502, failure.code, failure.message, { proveedor: 'gemini', http: response.status, estado: providerStatus || null, modelo: model || null });
  }
  try {
    return await response.json();
  } catch {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'Gemini devolvió una respuesta inválida.');
  }
}

async function analyze({ image, mimeType, services, observations, catalog }) {
  gemini.assertConfigured();
  const prompt = analysisPrompt({ services, observations, catalog });

  const data = await providerJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.ai.geminiModel)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.ai.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { mimeType, data: image.toString('base64') } },
        ] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1400,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    },
    env.ai.timeoutMs,
    'analizar la fotografía',
    env.ai.geminiModel,
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new AppError(502, 'AI_EMPTY_RESPONSE', 'Gemini no devolvió el análisis de la fotografía.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'Gemini devolvió un análisis con formato inválido.');
  }
}

async function generateImage({ image, mimeType, services, observations, analysis }) {
  gemini.assertConfigured();
  const prompt = imagePrompt({ services, observations, analysis });

  const data = await providerJson(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.ai.geminiApiKey,
        'Api-Revision': '2026-05-20',
      },
      body: JSON.stringify({
        model: env.ai.geminiImageModel,
        system_instruction: SYSTEM_INSTRUCTION,
        input: [
          { type: 'text', text: prompt },
          { type: 'image', mime_type: mimeType, data: image.toString('base64') },
        ],
        store: false,
      }),
    },
    env.ai.imageTimeoutMs,
    'generar la propuesta visual',
    env.ai.geminiImageModel,
  );
  const steps = [...(Array.isArray(data?.outputs) ? data.outputs : []), ...(Array.isArray(data?.steps) ? data.steps : [])];
  const blocks = steps.flatMap((step) => [
    ...(step?.type === 'image' ? [step] : []),
    ...(Array.isArray(step?.content) ? step.content : []),
  ]);
  const output = data?.output_image || blocks.find((item) => item?.type === 'image');
  const outputMimeType = output?.mime_type || output?.mimeType;
  if (!output?.data) {
    throw new AppError(502, 'AI_NO_IMAGE', 'Gemini no devolvió una imagen de propuesta. No se guardó una versión.');
  }
  return { data: output.data, mimeType: outputMimeType };
}

module.exports = { analyze, generateImage };
