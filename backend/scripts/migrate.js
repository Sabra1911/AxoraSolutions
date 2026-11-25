/* Ejecuta database/migrations/V*.sql en orden y registra las aplicadas en SCHEMA_MIGRATIONS.
   Uso: npm run db:migrate   (requiere .env con credenciales del esquema propietario) */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const DIR = path.resolve(__dirname, '../../database/migrations');

function splitStatements(sql) {
  const out = [];
  let buf = [];
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim() === '/') {
      const stmt = buf.join('\n').trim();
      if (stmt) out.push(stmt);
      buf = [];
    } else if (!/^\s*--/.test(line)) {
      buf.push(line);
    }
  }
  const last = buf.join('\n').trim();
  if (last) out.push(last);
  return out;
}

(async () => {
  await db.init();
  try {
    const exists = await db.queryOne("SELECT COUNT(*) AS N FROM USER_TABLES WHERE TABLE_NAME = 'SCHEMA_MIGRATIONS'");
    if (!exists.n) {
      await db.execute(`CREATE TABLE SCHEMA_MIGRATIONS (VERSION VARCHAR2(20) PRIMARY KEY, ARCHIVO VARCHAR2(200) NOT NULL, APLICADA_EN TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`);
    }
    const applied = new Set((await db.query('SELECT VERSION FROM SCHEMA_MIGRATIONS')).map((r) => r.version));
    const files = fs.readdirSync(DIR).filter((f) => /^V\d+__.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = file.split('__')[0];
      if (applied.has(version)) { console.log(`= ${file} (ya aplicada)`); continue; }
      console.log(`> Aplicando ${file}`);
      await db.withTransaction(async (conn) => {
        for (const stmt of splitStatements(fs.readFileSync(path.join(DIR, file), 'utf8'))) {
          await db.execute(stmt, {}, conn);
        }
        await db.execute('INSERT INTO SCHEMA_MIGRATIONS (VERSION, ARCHIVO) VALUES (:v, :f)', { v: version, f: file }, conn);
      });
    }
    console.log('Migraciones completas.');
  } catch (e) {
    console.error('Error en migración:', e.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
