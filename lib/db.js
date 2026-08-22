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

async function ensureSchema() {
  const db = getClient();
  // Ejecutamos cada CREATE TABLE por separado (no con db.batch) porque
  // batch() con DDL dispara en Turso una comprobación de "migration jobs"
  // que en bases de datos normales (sin esquema compartido) responde 400.
  const statements = [
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
  for (const sql of statements) {
    await db.execute(sql);
  }
}

module.exports = { getClient, ensureSchema };
