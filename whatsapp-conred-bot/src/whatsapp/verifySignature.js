/**
 * Middleware opcional que valida la firma X-Hub-Signature-256 enviada por
 * Meta en cada webhook, usando el App Secret de la app de WhatsApp. Si no se
 * configura WHATSAPP_APP_SECRET, el middleware no hace nada (permite pasar),
 * para facilitar pruebas locales.
 */
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

function verifySignature(req, res, next) {
  if (!env.whatsapp.appSecret) {
    return next();
  }

  const signatureHeader = req.get('X-Hub-Signature-256');
  if (!signatureHeader || !req.rawBody) {
    logger.warn('Peticion de webhook sin firma valida, se rechaza.');
    return res.sendStatus(401);
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', env.whatsapp.appSecret)
    .update(req.rawBody)
    .digest('hex')}`;

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    logger.warn('Firma de webhook invalida, se rechaza la peticion.');
    return res.sendStatus(401);
  }

  return next();
}

module.exports = verifySignature;
