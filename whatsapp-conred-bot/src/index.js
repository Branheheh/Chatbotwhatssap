const express = require('express');
const fs = require('fs');
const path = require('path');
const env = require('./config/env');
const { pool } = require('./config/db');
const webhookRoutes = require('./routes/webhook');
const healthRoutes = require('./routes/health');
const logger = require('./utils/logger');

const app = express();

// Guardamos el body "crudo" (rawBody) para poder validar la firma
// X-Hub-Signature-256 en el webhook de WhatsApp.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get('/', (req, res) => {
  res.json({
    name: 'whatsapp-conred-bot',
    status: 'running',
    description: 'Bot de WhatsApp - Incidencias de Informatica (arbol de navegacion + captura de datos)',
  });
});

app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);

async function ensureSchema() {
  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    logger.info('Esquema de base de datos verificado/aplicado correctamente.');
  } catch (err) {
    logger.error(
      'No se pudo aplicar el esquema automaticamente. Verifica DATABASE_URL o ejecuta "npm run migrate" manualmente.',
      err.message
    );
  }
}

async function start() {
  await ensureSchema();
  app.listen(env.port, () => {
    logger.info(`Servidor escuchando en el puerto ${env.port}`);
    logger.info(`Webhook de WhatsApp disponible en: /webhook`);
  });
}

start();
