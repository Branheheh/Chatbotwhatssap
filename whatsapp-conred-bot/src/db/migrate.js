/**
 * Aplica el esquema (schema.sql) contra la base de datos configurada en
 * DATABASE_URL. Es idempotente: usa CREATE TABLE/INDEX IF NOT EXISTS, por lo
 * que se puede ejecutar varias veces sin riesgo.
 *
 * Uso:
 *   npm run migrate
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // eslint-disable-next-line no-console
  console.log('[migrate] Aplicando esquema a la base de datos...');
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log('[migrate] Esquema aplicado correctamente.');
  await pool.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] Error aplicando el esquema:', err);
  process.exit(1);
});
