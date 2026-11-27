/**
 * Repositorio genérico para Oracle. Todo el SQL de lectura/escritura simple vive aquí:
 * nombres de columna salen de una lista blanca (config) y los valores siempre van como bind variables.
 */
const db = require('../config/db');
const { forbidden } = require('./errors');
const { parseLocalDate } = require('./dates');

const up = (c) => c.toUpperCase();
const DAY = 86400000;

function createRepository(cfg) {
  const {
    table, alias = 'T', columns, dateColumns = [], searchable = [], filters = [], notFilters = [],
    customFilters = {}, dateRangeColumn = 'creado_en', joins = '', selectExtra = '', select = null,
    orderBy = `${alias}.ID DESC`, empresaColumn = null, tecnicoColumn = null, readOnlyColumns = [],
    hasUpdatedAt = true,
  } = cfg;

  const known = new Set(['id', ...columns, ...readOnlyColumns]);
  const col = (c) => `${alias}.${up(c)}`;
  const assertCol = (c) => { if (!known.has(c)) throw new Error(`Columna no permitida: ${c}`); };
  const baseSelect = select || `${alias}.*`;
  const selectSql = `${baseSelect}${selectExtra ? `, ${selectExtra}` : ''}`;

  const norm = (c, v) => {
    if (v === undefined || v === '' || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (dateColumns.includes(c)) return parseLocalDate(v);
    return v;
  };
  const toBool = (v) => (v === true || v === 'true' || v === '1' || v === 1 ? 1 : 0);

  /** Determina el alcance (scope) a partir de la IDENTIDAD autenticada, nunca de parámetros del cliente. */
  function scopeFor(user) {
    if (user.isClient) {
      if (!user.empresaId) throw forbidden('El usuario no está vinculado a una empresa');
      return empresaColumn ? { [empresaColumn]: user.empresaId } : {};
    }
    if (user.isTecnicoOnly && tecnicoColumn) return { [tecnicoColumn]: user.id };
    return {};
  }

  function buildWhere(query = {}, scope = {}) {
    const where = [];
    const binds = {};
    for (const [c, v] of Object.entries(scope)) {
      assertCol(c);
      where.push(`${col(c)} = :s_${c}`);
      binds[`s_${c}`] = v;
    }
    for (const f of filters) {
      const v = query[f];
      if (v === undefined || v === '') continue;
      assertCol(f);
      where.push(`${col(f)} = :f_${f}`);
      binds[`f_${f}`] = f === 'activo' ? toBool(v) : v;
    }
    for (const f of notFilters) {
      const v = query[`not_${f}`];
      if (v === undefined || v === '') continue;
      assertCol(f);
      where.push(`${col(f)} <> :n_${f}`);
      binds[`n_${f}`] = v;
    }
    for (const [name, sql] of Object.entries(customFilters)) {
      const v = query[name];
      if (v === undefined || v === '') continue;
      where.push(sql.replace(/:v\b/g, `:c_${name}`));
      binds[`c_${name}`] = v;
    }
    if (query.desde && !Number.isNaN(Date.parse(query.desde))) {
      where.push(`${col(dateRangeColumn)} >= :desde`);
      binds.desde = parseLocalDate(query.desde);
    }
    if (query.hasta && !Number.isNaN(Date.parse(query.hasta))) {
      where.push(`${col(dateRangeColumn)} < :hasta`);
      binds.hasta = new Date(parseLocalDate(query.hasta).getTime() + DAY);
    }
    const term = typeof query.q === 'string' ? query.q.trim() : '';
    if (term && searchable.length) {
      where.push(`(${searchable.map((c) => `UPPER(${col(c)}) LIKE :q`).join(' OR ')})`);
      binds.q = `%${term.toUpperCase().slice(0, 80)}%`;
    }
    return { where, binds };
  }

  async function list(query = {}, scope = {}, conn = null) {
    const { where, binds } = buildWhere(query, scope);
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(query.size, 10) || 20));
    // Orden elegido por el usuario: solo columnas conocidas de la tabla (nunca texto libre en el SQL).
    const sortCol = typeof query.sort === 'string' ? query.sort.toLowerCase() : '';
    const sortSql = known.has(sortCol) ? `${col(sortCol)} ${String(query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}, ` : '';
    const from = `FROM ${table} ${alias} ${joins} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = (await db.queryOne(`SELECT COUNT(*) AS N ${from}`, binds, conn)).n;
    const data = await db.query(
      `SELECT ${selectSql} ${from} ORDER BY ${sortSql}${orderBy} OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
      { ...binds, off: (page - 1) * size, lim: size }, conn,
    );
    return { data, page, size, total };
  }

  async function findById(id, scope = {}, conn = null) {
    const { where, binds } = buildWhere({}, scope);
    where.unshift(`${col('id')} = :b_id`);
    binds.b_id = id;
    return db.queryOne(`SELECT ${selectSql} FROM ${table} ${alias} ${joins} WHERE ${where.join(' AND ')}`, binds, conn);
  }

  async function create(data, conn = null) {
    const cols = columns.filter((c) => data[c] !== undefined);
    const binds = Object.fromEntries(cols.map((c) => [`b_${c}`, norm(c, data[c])]));
    binds.out_id = { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER };
    const sql = `INSERT INTO ${table} (${cols.map(up).join(', ')}) VALUES (${cols.map((c) => `:b_${c}`).join(', ')}) RETURNING ID INTO :out_id`;
    const r = await db.execute(sql, binds, conn);
    return r.outBinds.out_id[0];
  }

  async function update(id, data, scope = {}, conn = null) {
    const cols = columns.filter((c) => data[c] !== undefined);
    if (!cols.length) return 0;
    const { where, binds } = buildWhere({}, scope);
    where.unshift(`${up('id')} = :b_id`);
    binds.b_id = id;
    const sets = cols.map((c) => `${up(c)} = :b_${c}`);
    cols.forEach((c) => { binds[`b_${c}`] = norm(c, data[c]); });
    if (hasUpdatedAt) sets.push('ACTUALIZADO_EN = SYSTIMESTAMP');
    // El alias no se usa en UPDATE: se reescribe el scope sin prefijo
    const plainWhere = where.map((w) => w.replace(new RegExp(`\\b${alias}\\.`, 'g'), ''));
    const r = await db.execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${plainWhere.join(' AND ')}`, binds, conn);
    return r.rowsAffected;
  }

  const setActive = (id, activo, scope = {}, conn = null) => update(id, { activo: activo ? 1 : 0 }, scope, conn);

  return { table, scopeFor, buildWhere, list, findById, create, update, setActive, columns };
}

module.exports = { createRepository };
