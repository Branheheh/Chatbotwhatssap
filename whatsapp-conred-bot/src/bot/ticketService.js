/**
 * Logica de negocio para tickets/incidencias.
 */
const { withTransaction, query } = require('../config/db');
 
/**
 * Genera el siguiente codigo de ticket (INC-000001, INC-000002, ...) y crea
 * el registro dentro de una misma transaccion para evitar condiciones de
 * carrera entre solicitudes concurrentes.
 */
async function createTicket({
  phoneNumber,
  contactName,
  department,
  location,
  category,
  priority,
  supportType,
  description,
}) {
  return withTransaction(async (client) => {
    const seq = await client.query("SELECT nextval('ticket_code_seq') AS n");
    const n = seq.rows[0].n;
    const ticketCode = `INC-${String(n).padStart(6, '0')}`;
 
    const { rows } = await client.query(
      `INSERT INTO tickets
        (ticket_code, phone_number, contact_name, department, location, category, priority, support_type, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'abierto')
       RETURNING id, ticket_code, status, created_at`,
      [ticketCode, phoneNumber, contactName, department, location, category, priority, supportType, description]
    );
 
    return rows[0];
  });
}
 
async function getTicketByCode(ticketCode) {
  const { rows } = await query(
    `SELECT ticket_code, category, priority, support_type, department, location, description, status, created_at, updated_at
     FROM tickets WHERE ticket_code = $1`,
    [ticketCode]
  );
  return rows[0] || null;
}
 
module.exports = { createTicket, getTicketByCode };