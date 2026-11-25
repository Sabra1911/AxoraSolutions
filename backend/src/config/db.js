const oracledb = require('oracledb');
const env = require('./env');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

let pool = null;

async function init() {
  const options = {
    user: env.db.user,
    password: env.db.password,
    connectString: env.db.connectString,
    poolMin: env.db.poolMin,
    poolMax: env.db.poolMax,
    poolTimeout: 60,
  };
  if (env.db.configDir) options.configDir = env.db.configDir;
  if (env.db.walletLocation) options.walletLocation = env.db.walletLocation;
  if (env.db.walletPassword) options.walletPassword = env.db.walletPassword;
  pool = await oracledb.createPool(options);
  return pool;
}

async function close() {
  if (pool) await pool.close(5);
  pool = null;
}

const lowerKeys = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));

/** Ejecuta SQL parametrizado. Con `conn` participa en una transacción; sin ella hace autocommit. */
async function execute(sql, binds = {}, conn = null, opts = {}) {
  if (conn) return conn.execute(sql, binds, opts);
  const c = await pool.getConnection();
  try {
    return await c.execute(sql, binds, { ...opts, autoCommit: true });
  } finally {
    await c.close();
  }
}

async function query(sql, binds = {}, conn = null) {
  const r = await execute(sql, binds, conn);
  return (r.rows || []).map(lowerKeys);
}

async function queryOne(sql, binds = {}, conn = null) {
  return (await query(sql, binds, conn))[0] || null;
}

async function withTransaction(fn) {
  const c = await pool.getConnection();
  try {
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (err) {
    try { await c.rollback(); } catch (_) { /* ignorar */ }
    throw err;
  } finally {
    await c.close();
  }
}

module.exports = { init, close, execute, query, queryOne, withTransaction, oracledb };
