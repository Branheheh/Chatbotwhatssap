const express = require('express');
const env = require('../config/env');
const whatsapp = require('../whatsapp/client');
const verifySignature = require('../whatsapp/verifySignature');
const engine = require('../bot/engine');
const logger = require('../utils/logger');

const router = express.Router();

// ---------------------------------------------------------------------
// GET /webhook -> Verificacion del webhook (Meta la llama una sola vez al
// configurar la URL en el panel de WhatsApp Cloud API).
// ---------------------------------------------------------------------
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    logger.info('Webhook verificado correctamente por Meta.');
    return res.status(200).send(challenge);
  }

  logger.warn('Intento de verificacion de webhook con token invalido.');
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------
// POST /webhook -> Recepcion de mensajes entrantes de WhatsApp.
// ---------------------------------------------------------------------
router.post('/', verifySignature, async (req, res) => {
  // Respondemos 200 de inmediato: Meta espera una respuesta rapida y
  // reintenta si no la recibe a tiempo.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // Puede ser una notificacion de estado (entregado/leido), no un mensaje.
      return;
    }

    const from = message.from; // numero del remitente, sin '+'
    const profileName = value?.contacts?.[0]?.profile?.name;

    let text = '';
    if (message.type === 'text') {
      text = message.text?.body || '';
    } else if (message.type === 'interactive') {
      text =
        message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id ||
        '';
    } else {
      // Tipos no soportados (imagen, audio, ubicacion, etc.)
      text = '';
    }

    whatsapp.markAsRead(message.id).catch(() => {});

    if (!text) {
      await whatsapp.sendText(
        from,
        '⚠️ Por el momento solo puedo procesar mensajes de texto. Escribe *menu* para ver las opciones disponibles.'
      );
      return;
    }

    const replies = await engine.handleIncomingMessage(from, text, profileName);

    // Se envian en orden y de forma secuencial para mantener la conversacion
    // legible (WhatsApp no garantiza orden de entrega en envios paralelos).
    // eslint-disable-next-line no-restricted-syntax
    for (const reply of replies) {
      // eslint-disable-next-line no-await-in-loop
      await whatsapp.sendText(from, reply);
    }
  } catch (err) {
    logger.error('Error procesando webhook de WhatsApp:', err);
  }
});

module.exports = router;
