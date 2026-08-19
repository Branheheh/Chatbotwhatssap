-- =====================================================
-- Esquema de base de datos: Bot de WhatsApp - Incidencias de Informatica
-- =====================================================

-- Sesiones activas de navegacion por usuario (una fila por numero de telefono).
-- Guarda en que nodo del arbol esta el usuario y los datos que ha capturado
-- hasta el momento, para persistir el progreso en tiempo real.
CREATE TABLE IF NOT EXISTS sessions (
  phone_number   VARCHAR(20) PRIMARY KEY,
  contact_name   VARCHAR(150),
  current_node   VARCHAR(60) NOT NULL DEFAULT 'root',
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         VARCHAR(30) NOT NULL DEFAULT 'activo', -- activo | esperando_tecnico | finalizado
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Secuencia para generar codigos de ticket correlativos (INC-000001, INC-000002, ...)
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START WITH 1;

-- Tickets/incidencias generados al confirmar un reporte.
CREATE TABLE IF NOT EXISTS tickets (
  id             SERIAL PRIMARY KEY,
  ticket_code    VARCHAR(20) UNIQUE NOT NULL,
  phone_number   VARCHAR(20) NOT NULL,
  contact_name   VARCHAR(150),
  department     VARCHAR(150),
  location       VARCHAR(150),
  category       VARCHAR(60) NOT NULL,
  priority       VARCHAR(60) NOT NULL,
  support_type   VARCHAR(10),
  description    TEXT NOT NULL,
  status         VARCHAR(30) NOT NULL DEFAULT 'abierto', -- abierto | en_proceso | resuelto | cerrado
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibilidad hacia atras: si la tabla ya existia sin esta columna
-- (bases de datos creadas antes de agregar el submenu ST1/ST2), se agrega
-- ahora sin afectar los datos existentes.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS support_type VARCHAR(10);

-- Bitacora de toda la conversacion (auditoria y trazabilidad).
CREATE TABLE IF NOT EXISTS conversation_log (
  id             BIGSERIAL PRIMARY KEY,
  phone_number   VARCHAR(20) NOT NULL,
  direction      VARCHAR(10) NOT NULL, -- entrante | saliente
  node           VARCHAR(60),
  message        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_phone ON tickets (phone_number);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_conversation_phone ON conversation_log (phone_number);
CREATE INDEX IF NOT EXISTS idx_conversation_created_at ON conversation_log (created_at);

-- Mantiene updated_at al dia automaticamente.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
