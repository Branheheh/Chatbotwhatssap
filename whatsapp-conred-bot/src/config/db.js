const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.db.connectionString,
  ssl: env.db.ssl,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Error inesperado en el pool de PostgreSQL:', err);
});

/**
 * Ejecuta una consulta SQL usando el pool compartido.
 * @param {string} text - Consulta SQL con placeholders ($1, $2, ...)
 * @param {Array} params - Parametros de la consulta
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta una funcion dentro de una transaccion (BEGIN/COMMIT/ROLLBACK).
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
