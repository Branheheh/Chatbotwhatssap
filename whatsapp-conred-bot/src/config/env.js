require('dotenv').config();

const required = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'DATABASE_URL',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // No detenemos el proceso para permitir arrancar en modo desarrollo sin
  // WhatsApp configurado todavia, pero avisamos claramente en consola.
  // eslint-disable-next-line no-console
  console.warn(
    `[env] Advertencia: faltan variables de entorno: ${missing.join(', ')}. ` +
      'Revisa tu archivo .env (usa .env.example como referencia).'
  );
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  },

  db: {
    connectionString: process.env.DATABASE_URL || '',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  },
};
