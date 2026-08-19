/**
 * Persistencia de sesiones de navegacion y bitacora de conversacion.
 *
 * Cada vez que el usuario avanza en el arbol o se capturan datos nuevos, se
 * hace un UPSERT inmediato contra la tabla `sessions`, de forma que el
 * progreso queda guardado en tiempo real (si la conversacion se corta, no se
 * pierde lo ya capturado).
 */
const { query } = require('../config/db');

async function getSession(phoneNumber) {
  const { rows } = await query(
    'SELECT phone_number, contact_name, current_node, data, status FROM sessions WHERE phone_number = $1',
    [phoneNumber]
  );
  return rows[0] || null;
}

async function getOrCreateSession(phoneNumber, profileName) {
  const existing = await getSession(phoneNumber);
  if (existing) return existing;

  const { rows } = await query(
    `INSERT INTO sessions (phone_number, contact_name, current_node, data, status)
     VALUES ($1, $2, 'root', '{}'::jsonb, 'activo')
     RETURNING phone_number, contact_name, current_node, data, status`,
    [phoneNumber, profileName || null]
  );
  return rows[0];
}

/**
 * Guarda el estado actual de la sesion (nodo, datos capturados y status).
 * Se usa despues de cada mensaje procesado para persistir en tiempo real.
 */
async function saveSession(phoneNumber, { currentNode, data, status, contactName }) {
  await query(
    `UPDATE sessions
     SET current_node = $2,
         data = $3::jsonb,
         status = COALESCE($4, status),
         contact_name = COALESCE($5, contact_name)
     WHERE phone_number = $1`,
    [phoneNumber, currentNode, JSON.stringify(data || {}), status || null, contactName || null]
  );
}

/**
 * Reinicia la sesion de un usuario al nodo raiz, limpiando los datos
 * capturados (usado al volver al menu principal o cancelar un flujo).
 */
async function resetSession(phoneNumber) {
  await query(
    `UPDATE sessions
     SET current_node = 'root', data = '{}'::jsonb, status = 'activo'
     WHERE phone_number = $1`,
    [phoneNumber]
  );
}

async function logMessage(phoneNumber, direction, node, message) {
  await query(
    `INSERT INTO conversation_log (phone_number, direction, node, message)
     VALUES ($1, $2, $3, $4)`,
    [phoneNumber, direction, node || null, message || '']
  );
}

module.exports = {
  getSession,
  getOrCreateSession,
  saveSession,
  resetSession,
  logMessage,
};
