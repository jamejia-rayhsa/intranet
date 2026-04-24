-- ============================================
-- MIGRACIÓN 001: Tablas del módulo Portal
-- ============================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  correo VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100),
  auth_tipo VARCHAR(20) NOT NULL DEFAULT 'local',
  external_id VARCHAR(100),
  hash_password TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Tabla de roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

-- Tabla de permisos
CREATE TABLE IF NOT EXISTS permisos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
);

-- Tabla intermedia rol-permiso
CREATE TABLE IF NOT EXISTS rol_permiso (
  rol_id INT REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id INT REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- Tabla intermedia usuario-rol
CREATE TABLE IF NOT EXISTS usuario_rol (
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id INT REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, rol_id)
);

-- Tabla de módulos
CREATE TABLE IF NOT EXISTS modulos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  path_reactivo VARCHAR(150),
  descripcion TEXT,
  activo BOOLEAN DEFAULT true
);

-- Tabla de noticias
CREATE TABLE IF NOT EXISTS noticias (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  subtitulo TEXT,
  contenido TEXT,
  tipo VARCHAR(30),
  fecha_publicacion DATE,
  publicada BOOLEAN DEFAULT false,
  autor_id INT REFERENCES usuarios(id),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Agregar foreign key de auditoria a usuarios (si la tabla auditoria ya existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditoria') THEN
    ALTER TABLE auditoria ADD CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
  END IF;
END $$;

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_noticias_publicada ON noticias(publicada);
CREATE INDEX IF NOT EXISTS idx_noticias_fecha ON noticias(fecha_publicacion DESC);
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);
