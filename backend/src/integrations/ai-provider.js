/**
 * Selector de proveedor de IA del Diseñador de espacios (AI_PROVIDER en backend/.env).
 * El frontend solo habla con la API propia. Para sumar otro proveedor: cree integrations/<nombre>-space.js con
 * { assertConfigured, analyze, generateImage } y regístrelo en ADAPTERS. Se resuelve en cada llamada (las pruebas pueden sustituirlo).
 */
const env = require('../config/env');
const gemini = require('./gemini');
const geminiSpace = require('./gemini-space');
const openaiSpace = require('./openai-space');

const ADAPTERS = {
  gemini: { label: 'Google Gemini', assertConfigured: () => gemini.assertConfigured(), impl: () => geminiSpace, imageModel: () => env.ai.geminiImageModel },
  openai: { label: 'OpenAI', assertConfigured: () => openaiSpace.assertConfigured(), impl: () => openaiSpace, imageModel: () => env.ai.openai.imageModel },
};
const active = () => ADAPTERS[env.ai.imageProvider] || ADAPTERS.gemini;
module.exports = {
  name: () => (ADAPTERS[env.ai.imageProvider] ? env.ai.imageProvider : 'gemini'),
  label: () => active().label,
  imageModel: () => active().imageModel(),
  assertConfigured: () => active().assertConfigured(),
  analyze: (args) => active().impl().analyze(args),
  generateImage: (args) => active().impl().generateImage(args),
};
