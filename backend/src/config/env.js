require('dotenv').config();

const get = (k, def) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : def);
const required = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable de entorno obligatoria ${k}`);
  return v;
};

const nodeEnv = get('NODE_ENV', 'development');
const accessSecret = required('JWT_ACCESS_SECRET');
if (accessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 caracteres');

if (!['gemini', 'openai'].includes(get('AI_PROVIDER', 'gemini').toLowerCase())) throw new Error("AI_PROVIDER debe ser 'gemini' u 'openai'");

module.exports = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(get('PORT', 3000)),
  appUrl: get('APP_URL', 'http://localhost:4200'),
  corsOrigins: get('CORS_ORIGINS', 'http://localhost:4200').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    user: get('DB_USER', ''),
    password: get('DB_PASSWORD', ''),
    connectString: get('DB_CONNECT_STRING', ''),
    configDir: get('DB_CONFIG_DIR', ''),
    walletLocation: get('DB_WALLET_LOCATION', ''),
    walletPassword: get('DB_WALLET_PASSWORD', ''),
    poolMin: Number(get('DB_POOL_MIN', 2)),
    poolMax: Number(get('DB_POOL_MAX', 10)),
  },
  jwt: { accessSecret, accessTtl: get('JWT_ACCESS_TTL', '15m'), issuer: 'ms-en-linea' },
  refreshTtlDays: Number(get('REFRESH_TTL_DAYS', 7)),
  upload: {
    dir: get('UPLOAD_DIR', './uploads'),
    maxFileBytes: Number(get('MAX_FILE_MB', 5)) * 1024 * 1024,
    maxFiles: Number(get('MAX_FILES_PER_REQUEST', 5)),
  },
  mail: {
    mode: get('MAIL_MODE', 'console'),
    from: get('MAIL_FROM', 'MS En Línea <no-responder@example.com>'),
    host: get('SMTP_HOST', ''),
    port: Number(get('SMTP_PORT', 587)),
    user: get('SMTP_USER', ''),
    pass: get('SMTP_PASS', ''),
  },
  /** Datos del emisor que se imprimen en las cotizaciones PDF. Solo se muestra lo configurado: no se inventan valores. */
  company: {
    brand: get('COMPANY_BRAND', 'AXORA SOLUTIONS'),
    tagline: get('COMPANY_TAGLINE', 'Tu aliado tecnológico'),
    legalName: get('COMPANY_LEGAL_NAME', ''),
    nit: get('COMPANY_NIT', ''),
    address: get('COMPANY_ADDRESS', ''),
    phone: get('COMPANY_PHONE', ''),
    email: get('COMPANY_EMAIL', ''),
    web: get('COMPANY_WEB', ''),
    quoteTerms: get('QUOTE_TERMS', '').split('|').map((t) => t.trim()).filter(Boolean),   // separe condiciones con "|"
    quoteExecutionTime: get('QUOTE_EXECUTION_TIME', ''),
    quoteWarranty: get('QUOTE_WARRANTY', ''),
  },
  ai: {
    /** Proveedor del Diseñador de espacios: 'gemini' (por defecto) u 'openai'. Cambiarlo no requiere tocar el frontend. */
    imageProvider: get('AI_PROVIDER', 'gemini').toLowerCase(),
    openai: {
      apiKey: get('OPENAI_API_KEY', ''),
      textModel: get('OPENAI_MODEL', ''),
      imageModel: get('OPENAI_IMAGE_MODEL', ''),
      imageSize: get('OPENAI_IMAGE_SIZE', 'auto'),
      imageQuality: get('OPENAI_IMAGE_QUALITY', 'medium'),
      timeoutMs: Number(get('OPENAI_TIMEOUT_MS', 60000)),
      imageTimeoutMs: Number(get('OPENAI_IMAGE_TIMEOUT_MS', 180000)),
    },
    geminiApiKey: get('GEMINI_API_KEY', ''),
    geminiModel: get('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    geminiImageModel: get('GEMINI_IMAGE_MODEL', 'gemini-nano-banana-2.1'),
    timeoutMs: Number(get('GEMINI_TIMEOUT_MS', 60000)),
    imageTimeoutMs: Number(get('GEMINI_IMAGE_TIMEOUT_MS', 120000)),
  },
};
