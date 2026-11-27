const env = require('./config/env');
const db = require('./config/db');
const app = require('./app');

(async () => {
  await db.init();
  const server = app.listen(env.port, () => console.log(`MS En Línea API escuchando en :${env.port} (${env.nodeEnv})`));
  const shutdown = async () => { server.close(); await db.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((e) => { console.error('No se pudo iniciar:', e.message); process.exit(1); });
