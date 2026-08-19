/**
 * Arbol de navegacion (menu IVR) del bot de WhatsApp para reporte de
 * incidencias de informatica.
 *
 * Cada nodo tiene un "type" que el motor (engine.js) sabe interpretar:
 *
 *  - menu:    Muestra opciones numeradas. El usuario responde con un numero
 *             que debe coincidir con una clave de "options". Cada opcion
 *             puede fijar campos en session.data ("set") y define a que
 *             nodo saltar ("next").
 *  - input:   Espera texto libre del usuario y lo guarda en session.data[field].
 *  - confirm: Espera 1 (si) o 2 (no) y salta a "yes" o "no" segun corresponda.
 *  - action:  Nodo sin interaccion directa: el motor ejecuta una funcion de
 *             negocio (definida en engine.js -> actionHandlers) que puede
 *             leer/escribir en la base de datos (crear ticket, consultar
 *             estado, etc.) y decide el siguiente nodo.
 *  - end:     Nodo terminal informativo.
 *
 * Los mensajes se definen como funciones (data) => string para poder
 * interpolar los datos capturados hasta el momento (por ejemplo, el resumen
 * antes de confirmar el envio del reporte).
 */
 
const CATEGORIES = {
  1: 'Soporte Tecnico (hardware, impresora, etc.)',
  2: 'Software (programas, sistema operativo)',
  3: 'Red / Internet',
  4: 'Correo electronico',
  5: 'Otro',
};
 
const PRIORITIES = {
  1: 'Alta - Impide trabajar',
  2: 'Media - Afecta parcialmente',
  3: 'Baja - No urgente',
};
 
function buildOptionsFromMap(map, nextNode, field) {
  const options = {};
  Object.entries(map).forEach(([key, label]) => {
    options[key] = { label, next: nextNode, set: { [field]: label } };
  });
  return options;
}
 
const menuTree = {
  // ---------------------------------------------------------------------
  // Menu principal
  // ---------------------------------------------------------------------
  root: {
    type: 'menu',
    message: () =>
      '👋 Bienvenido al *Soporte Tecnico de Informatica*.\n\n' +
      'Selecciona una opcion escribiendo el numero:\n\n' +
      '1️⃣ Reportar una incidencia\n' +
      '2️⃣ Consultar estado de un ticket\n' +
      '3️⃣ Hablar con un tecnico\n' +
      '0️⃣ Salir',
    options: {
      1: { label: 'Reportar incidencia', next: 'reportar_tipo_soporte' },
      2: { label: 'Consultar ticket', next: 'consultar_ticket_codigo' },
      3: { label: 'Hablar con tecnico', next: 'hablar_tecnico' },
      0: { label: 'Salir', next: 'despedida' },
    },
    invalidMessage:
      '⚠️ Opcion no valida. Responde con el numero de una de las opciones del menu (0-3).',
  },
 
  // ---------------------------------------------------------------------
  // Flujo: Reportar incidencia
  // ---------------------------------------------------------------------
  reportar_tipo_soporte: {
    type: 'menu',
    message: () =>
      '🧰 Selecciona el *tipo de soporte*:\n\n' +
      '1️⃣ ST1\n' +
      '2️⃣ ST2',
    options: {
      1: { label: 'ST1', next: 'reportar_categoria', set: { support_type: 'ST1' } },
      2: { label: 'ST2', next: 'reportar_categoria', set: { support_type: 'ST2' } },
    },
    invalidMessage: '⚠️ Opcion no valida. Responde 1 para ST1 o 2 para ST2.',
  },
 
  reportar_categoria: {
    type: 'menu',
    message: () =>
      '🛠️ Selecciona la *categoria* de tu incidencia:\n\n' +
      Object.entries(CATEGORIES)
        .map(([k, v]) => `${k}️⃣ ${v}`)
        .join('\n'),
    options: buildOptionsFromMap(CATEGORIES, 'reportar_prioridad', 'category'),
    invalidMessage: '⚠️ Opcion no valida. Responde con un numero del 1 al 5.',
  },
 
  reportar_prioridad: {
    type: 'menu',
    message: () =>
      '🚦 ¿Cual es la *prioridad* de tu incidencia?\n\n' +
      Object.entries(PRIORITIES)
        .map(([k, v]) => `${k}️⃣ ${v}`)
        .join('\n'),
    options: buildOptionsFromMap(PRIORITIES, 'reportar_area', 'priority'),
    invalidMessage: '⚠️ Opcion no valida. Responde con un numero del 1 al 3.',
  },
 
  reportar_area: {
    type: 'input',
    message: () => '🏢 ¿En que *area o departamento* trabajas?',
    field: 'department',
    next: 'reportar_ubicacion',
  },
 
  reportar_ubicacion: {
    type: 'input',
    message: () =>
      '📍 ¿Cual es tu *ubicacion fisica* (sede, edificio, oficina)?',
    field: 'location',
    next: 'reportar_descripcion',
  },
 
  reportar_descripcion: {
    type: 'input',
    message: () =>
      '📝 Describe brevemente el *problema* que estas presentando:',
    field: 'description',
    next: 'reportar_nombre',
  },
 
  reportar_nombre: {
    type: 'input',
    message: () => '🙋 ¿Cual es tu *nombre completo*?',
    field: 'contact_name',
    next: 'reportar_confirmar',
  },
 
  reportar_confirmar: {
    type: 'confirm',
    message: (data) =>
      '📋 *Resumen de tu incidencia:*\n\n' +
      `• Tipo de soporte: ${data.support_type || '-'}\n` +
      `• Categoria: ${data.category || '-'}\n` +
      `• Prioridad: ${data.priority || '-'}\n` +
      `• Area: ${data.department || '-'}\n` +
      `• Ubicacion: ${data.location || '-'}\n` +
      `• Descripcion: ${data.description || '-'}\n` +
      `• Nombre: ${data.contact_name || '-'}\n\n` +
      '¿Confirmas el envio de esta incidencia?\n' +
      '1️⃣ Si, enviar\n' +
      '2️⃣ No, cancelar',
    yes: 'reportar_crear_ticket',
    no: 'reportar_cancelado',
    invalidMessage: '⚠️ Responde 1 para confirmar o 2 para cancelar.',
  },
 
  reportar_crear_ticket: {
    type: 'action',
    action: 'crearTicket',
  },
 
  reportar_cancelado: {
    type: 'action',
    action: 'cancelarReporte',
  },
 
  // ---------------------------------------------------------------------
  // Flujo: Consultar estado de ticket
  // ---------------------------------------------------------------------
  consultar_ticket_codigo: {
    type: 'input',
    message: () =>
      '🔎 Escribe el *codigo* de tu ticket (ejemplo: INC-000123):',
    field: 'lookup_code',
    next: 'consultar_ticket_resultado',
  },
 
  consultar_ticket_resultado: {
    type: 'action',
    action: 'consultarTicket',
  },
 
  // ---------------------------------------------------------------------
  // Flujo: Hablar con un tecnico
  // ---------------------------------------------------------------------
  hablar_tecnico: {
    type: 'action',
    action: 'solicitarTecnico',
  },
 
  esperando_tecnico: {
    type: 'end',
    message: () =>
      '👨‍💻 Un tecnico se pondra en contacto contigo pronto.\n' +
      'Escribe *menu* si deseas volver al menu principal.',
  },
 
  // ---------------------------------------------------------------------
  // Salida
  // ---------------------------------------------------------------------
  despedida: {
    type: 'end',
    restartOnAnyInput: true,
    message: () =>
      '👋 Gracias por contactar al *Soporte Tecnico de Informatica*. ¡Hasta pronto!\n' +
      'Escribe cualquier mensaje para volver a empezar.',
  },
};
 
module.exports = { menuTree, CATEGORIES, PRIORITIES };
 