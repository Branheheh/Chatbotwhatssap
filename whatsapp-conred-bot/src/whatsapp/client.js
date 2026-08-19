/**
 * Cliente delgado sobre la Graph API de WhatsApp Cloud API para enviar
 * mensajes de texto.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const baseURL = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}`;

const http = axios.create({
  baseURL,
  headers: {
    Authorization: `Bearer ${env.whatsapp.token}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Envia un mensaje de texto plano a un numero de WhatsApp.
 * @param {string} to - Numero de destino en formato E.164 sin '+' (ej: 50212345678)
 * @param {string} body - Contenido del mensaje
 */
async function sendText(to, body) {
  try {
    await http.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    });
  } catch (err) {
    const details = err.response?.data || err.message;
    logger.error('Error enviando mensaje de WhatsApp:', JSON.stringify(details));
    throw err;
  }
}

/**
 * Marca un mensaje entrante como leido (checks azules). No es critico para
 * el funcionamiento del bot; falla en silencio si algo sale mal.
 * @param {string} messageId
 */
async function markAsRead(messageId) {
  try {
    await http.post('/messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch (err) {
    logger.warn('No se pudo marcar el mensaje como leido:', err.response?.data || err.message);
  }
}

module.exports = { sendText, markAsRead };
