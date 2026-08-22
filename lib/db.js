const { createClient } = require('@libsql/client');

let client;
function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
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

// Creamos las tablas hablando directamente con la API HTTP de Turso, no con
// @libsql/client: ese cliente, al ejecutar DDL (CREATE TABLE), intenta
// comprobar el estado en /v1/jobs -- un endpoint de "Multi-DB Schemas" que
// Turso no ofrece en el plan gratuito sobre AWS. Eso hace fallar la petición
// con un 400 aunque las tablas en si no tengan ningun problema.
async function ensureSchema() {
  const baseUrl = process.env.TURSO_DATABASE_URL.replace(/^libsql:/, 'https:');
  const res = await fetch(`${baseUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      requests: [
        ...SCHEMA_STATEMENTS.map((sql) => ({ type: 'execute', stmt: { sql } })),
        { type: 'close' },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} creando las tablas: ${text}`);
  }

  const json = await res.json();
  const fallo = (json.results || []).find((r) => r.type === 'error');
  if (fallo) {
    throw new Error(
      (fallo.error && fallo.error.message) || 'Error desconocido creando las tablas'
    );
  }
}

module.exports = { getClient, ensureSchema };
