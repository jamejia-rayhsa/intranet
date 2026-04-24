-- ============================================
-- MIGRACIÓN 001: Tablas del módulo Tickets
-- ============================================

-- Tabla de categorías de tickets
CREATE TABLE IF NOT EXISTS ticket_categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono VARCHAR(50) DEFAULT 'cog',
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categorias_nombre ON ticket_categorias(nombre);

-- Datos iniciales de categorías
INSERT INTO ticket_categorias (nombre, descripcion, icono) VALUES
  ('Soporte TI', 'Problemas técnicos de hardware y software', 'computer'),
  ('Recursos Humanos', 'Consultas y trámites de RH', 'users'),
  ('Administrativo', 'Trámites administrativos generales', 'folder'),
  ('Instalaciones', 'Mantenimiento y espacios físicos', 'building'),
  ('Otro', 'Otros tipos de solicitudes', 'cog')
ON CONFLICT (nombre) DO NOTHING;

-- Tabla de tickets
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  nivel_atencion VARCHAR(20) NOT NULL CHECK (nivel_atencion IN ('bajo', 'medio', 'alto', 'critico')),
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
  categoria VARCHAR(50),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_cierre TIMESTAMP,
  fecha_actualizacion TIMESTAMP,
  tecnico_asignado_id INT REFERENCES usuarios(id)
);

-- Tabla de adjuntos de tickets
CREATE TABLE IF NOT EXISTS ticket_adjuntos (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id) ON DELETE CASCADE,
  nombre_archivo VARCHAR(255),
  tipo_mime VARCHAR(100),
  ruta_archivo VARCHAR(500),
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- Tabla de encuestas de satisfacción
CREATE TABLE IF NOT EXISTS ticket_encuestas (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id) ON DELETE CASCADE,
  calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentarios TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_usuario ON tickets(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets(tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_tickets_nivel ON tickets(nivel_atencion);
CREATE INDEX IF NOT EXISTS idx_tickets_fecha ON tickets(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_adjuntos_ticket ON ticket_adjuntos(ticket_id);
CREATE INDEX IF NOT EXISTS idx_encuestas_ticket ON ticket_encuestas(ticket_id);
