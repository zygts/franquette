// Cliente mínimo para la API HTTP de Turso (sin depender de @libsql/client,
// que en esta cuenta intenta consultar /v1/jobs -- no disponible en el plan
// Free sobre AWS -- y provoca fallos incluso fuera de la creación de tablas).

function baseUrl() {
  return process.env.TURSO_DATABASE_URL.replace(/^libsql:/, 'https:');
}

function toArg(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value: String(value) };
  }
  return { type: 'text', value: String(value) };
}

function fromCell(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') return parseInt(cell.value, 10);
  if (cell.type === 'float') return parseFloat(cell.value);
  return cell.value;
}

async function pipeline(executeRequests) {
  const res = await fetch(`${baseUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ requests: [...executeRequests, { type: 'close' }] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} hablando con Turso: ${text}`);
  }

  const json = await res.json();
  const results = json.results || [];
  for (const r of results) {
    if (r.type === 'error') {
      throw new Error((r.error && r.error.message) || 'Error SQL desconocido');
    }
  }
  return results;
}

// Ejecuta una sola sentencia con argumentos posicionales y devuelve filas
// como objetos planos { columna: valor }.
async function run(sql, args = []) {
  const results = await pipeline([{ type: 'execute', stmt: { sql, args: args.map(toArg) } }]);
  const result = results[0].response.result;
  const cols = result.cols.map((c) => c.name);
  const rows = result.rows.map((row) => {
    const obj = {};
    row.forEach((cell, i) => {
      obj[cols[i]] = fromCell(cell);
    });
    return obj;
  });
  return { rows, rowsAffected: result.affected_row_count };
}

// Ejecuta varias sentencias en la misma conexión (una sola petición HTTP).
async function runMany(statements) {
  await pipeline(
    statements.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args || []).map(toArg) } }))
  );
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS viajes (
    codigo TEXT PRIMARY KEY,
    nombre TEXT,
    creado_en TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS participantes (
    id TEXT PRIMARY KEY,
    viaje_codigo TEXT,
    nombre TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gastos (
    id TEXT PRIMARY KEY,
    viaje_codigo TEXT,
    descripcion TEXT,
    importe REAL,
    pagador_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gasto_participantes (
    gasto_id TEXT,
    participante_id TEXT
  )`,
];

async function ensureSchema() {
  await pipeline(SCHEMA_STATEMENTS.map((sql) => ({ type: 'execute', stmt: { sql } })));
}

module.exports = { run, runMany, ensureSchema };
