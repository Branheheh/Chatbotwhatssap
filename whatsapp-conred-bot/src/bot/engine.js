/**
 * Motor de navegacion del bot: procesa un mensaje entrante segun el nodo
 * actual de la sesion del usuario, captura datos y avanza por el arbol
 * definido en menuTree.js, persistiendo el progreso en tiempo real en
 * PostgreSQL.
 */
const { menuTree } = require('./menuTree');
const sessionStore = require('./sessionStore');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');
const { formatDateTime } = require('../utils/format');
 
// ---------------------------------------------------------------------
// Handlers de acciones (nodos type: "action"): se ejecutan sin esperar
// entrada del usuario y suelen tocar la base de datos.
// Firma: async (data, phoneNumber) => { messages, next, data, status? }
// ---------------------------------------------------------------------
const actionHandlers = {
  async crearTicket(data, phoneNumber) {
    try {
      const ticket = await ticketService.createTicket({
        phoneNumber,
        contactName: data.contact_name,
        department: data.department,
        location: data.location,
        category: data.category,
        priority: data.priority,
        supportType: data.support_type,
        description: data.description,
      });
 
      return {
        messages: [
          '✅ Tu incidencia fue registrada con exito.\n\n' +
            `🎫 *Ticket:* ${ticket.ticket_code}\n` +
            `📌 Estado: ${ticket.status}\n\n` +
            'Guarda este codigo para consultar el estado mas adelante (opcion 2 del menu).',
        ],
        next: 'root',
        data: {},
      };
    } catch (err) {
      logger.error('Error creando ticket:', err);
      return {
        messages: [
          '⚠️ Ocurrio un error al registrar tu incidencia. Por favor intenta nuevamente en unos minutos.',
        ],
        next: 'root',
        data: {},
      };
    }
  },
 
  async cancelarReporte() {
    return {
      messages: ['🚫 El reporte fue cancelado.'],
      next: 'root',
      data: {},
    };
  },
 
  async consultarTicket(data) {
    const code = (data.lookup_code || '').trim().toUpperCase();
    try {
      const ticket = await ticketService.getTicketByCode(code);
      if (!ticket) {
        return {
          messages: [
            `❌ No se encontro ningun ticket con el codigo *${code}*. Verifica el codigo e intenta de nuevo.`,
          ],
          next: 'root',
          data: {},
        };
      }
      return {
        messages: [
          `🎫 *Ticket:* ${ticket.ticket_code}\n` +
            `📌 Estado: ${ticket.status}\n` +
            `🧰 Tipo de soporte: ${ticket.support_type || '-'}\n` +
            `🛠️ Categoria: ${ticket.category}\n` +
            `🚦 Prioridad: ${ticket.priority}\n` +
            `📝 Descripcion: ${ticket.description}\n` +
            `🗓️ Creado: ${formatDateTime(ticket.created_at)}\n` +
            `🔄 Actualizado: ${formatDateTime(ticket.updated_at)}`,
        ],
        next: 'root',
        data: {},
      };
    } catch (err) {
      logger.error('Error consultando ticket:', err);
      return {
        messages: ['⚠️ Ocurrio un error al consultar el ticket. Intenta nuevamente en unos minutos.'],
        next: 'root',
        data: {},
      };
    }
  },
 
  async solicitarTecnico(data) {
    // No agrega mensaje propio: el nodo de destino ("esperando_tecnico")
    // ya trae el mensaje informativo, evitando duplicados.
    return {
      messages: [],
      next: 'esperando_tecnico',
      data,
      status: 'esperando_tecnico',
    };
  },
};
 
function processInteractiveNode(node, text, data) {
  if (node.type === 'menu') {
    const opt = node.options[text];
    if (!opt) return { matched: false, data };
    return { matched: true, next: opt.next, data: { ...data, ...(opt.set || {}) } };
  }
 
  if (node.type === 'input') {
    const value = (text || '').trim();
    if (!value) return { matched: false, data };
    return { matched: true, next: node.next, data: { ...data, [node.field]: value } };
  }
 
  if (node.type === 'confirm') {
    if (text === '1') return { matched: true, next: node.yes, data };
    if (text === '2') return { matched: true, next: node.no, data };
    return { matched: false, data };
  }
 
  return { matched: false, data };
}
 
async function persistAndLog(phoneNumber, nodeId, data, status, outgoingMessages) {
  await sessionStore.saveSession(phoneNumber, { currentNode: nodeId, data, status });
  // eslint-disable-next-line no-restricted-syntax
  for (const msg of outgoingMessages) {
    // eslint-disable-next-line no-await-in-loop
    await sessionStore.logMessage(phoneNumber, 'saliente', nodeId, msg);
  }
}
 
/**
 * Procesa un mensaje entrante de WhatsApp y devuelve la lista de mensajes
 * (texto plano) que deben enviarse de vuelta al usuario.
 *
 * @param {string} phoneNumber - Numero del remitente (formato E.164 sin '+')
 * @param {string} rawText - Texto del mensaje recibido
 * @param {string} [profileName] - Nombre de perfil de WhatsApp del remitente
 * @returns {Promise<string[]>}
 */
async function handleIncomingMessage(phoneNumber, rawText, profileName) {
  const text = (rawText || '').toString().trim();
  const lower = text.toLowerCase();
 
  const session = await sessionStore.getOrCreateSession(phoneNumber, profileName);
  await sessionStore.logMessage(phoneNumber, 'entrante', session.current_node, text);
 
  let data = { ...(session.data || {}) };
  let nextId = session.current_node || 'root';
  const outgoing = [];
  let statusUpdate = null;
 
  const isGlobalMenu = lower === 'menu' || lower === 'inicio';
  const isGlobalCancel = lower === 'cancelar';
 
  if (isGlobalMenu) {
    nextId = 'root';
    data = {};
    statusUpdate = 'activo';
  } else if (isGlobalCancel) {
    outgoing.push('🚫 Operacion cancelada.');
    nextId = 'root';
    data = {};
    statusUpdate = 'activo';
  } else {
    const currentNode = menuTree[nextId] || menuTree.root;
 
    if (currentNode.type === 'end') {
      if (currentNode.restartOnAnyInput) {
        nextId = 'root';
        data = {};
        statusUpdate = 'activo';
      } else {
        // Nodo terminal que espera un comando explicito (ej. "menu"):
        // reforzamos el mensaje sin avanzar el arbol.
        outgoing.push(currentNode.message(data));
        await persistAndLog(phoneNumber, nextId, data, statusUpdate, outgoing);
        return outgoing;
      }
    } else {
      const result = processInteractiveNode(currentNode, text, data);
      if (!result.matched) {
        outgoing.push(currentNode.invalidMessage || '⚠️ No entendi tu respuesta.');
        outgoing.push(currentNode.message(data));
        await persistAndLog(phoneNumber, nextId, data, statusUpdate, outgoing);
        return outgoing;
      }
      nextId = result.next;
      data = result.data;
    }
  }
 
  // Resuelve en cadena los nodos tipo "action" (no requieren entrada del
  // usuario): por ejemplo, tras confirmar un reporte se crea el ticket en
  // la base de datos inmediatamente y se salta al siguiente nodo visible.
  let guard = 0;
  while (menuTree[nextId] && menuTree[nextId].type === 'action' && guard < 10) {
    guard += 1;
    const actionName = menuTree[nextId].action;
    const handler = actionHandlers[actionName];
    if (!handler) {
      logger.error(`No existe handler registrado para la accion "${actionName}"`);
      nextId = 'root';
      data = {};
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await handler(data, phoneNumber);
    outgoing.push(...result.messages);
    nextId = result.next;
    data = result.data;
    if (result.status) statusUpdate = result.status;
  }
 
  const finalNode = menuTree[nextId] || menuTree.root;
  outgoing.push(finalNode.message(data));
 
  await persistAndLog(phoneNumber, nextId, data, statusUpdate, outgoing);
  return outgoing;
}
 
module.exports = { handleIncomingMessage };
 