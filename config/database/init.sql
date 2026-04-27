-- ============================================
-- INICIALIZACIÓN DE BASE DE DATOS - INTRANET
-- ============================================

-- Tabla de auditoría (debe existir primero porque la usan todos los módulos)
CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL,
  modulo VARCHAR(100) NOT NULL,
  tabla VARCHAR(100) NOT NULL,
  registro_id VARCHAR(100) NOT NULL,
  accion VARCHAR(20) NOT NULL,
  valores_previos JSONB,
  valores_nuevos JSONB,
  ip_origen VARCHAR(45),
  user_agent TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);

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
  requiere_cambio_password BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- Agregar foreign key de auditoria a usuarios (después de crear usuarios)
ALTER TABLE auditoria ADD CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id);

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
  rol_id INT REFERENCES roles(id),
  permiso_id INT REFERENCES permisos(id),
  PRIMARY KEY (rol_id, permiso_id)
);

-- Tabla intermedia usuario-rol
CREATE TABLE IF NOT EXISTS usuario_rol (
  usuario_id INT REFERENCES usuarios(id),
  rol_id INT REFERENCES roles(id),
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

-- Tabla de imágenes de noticias
CREATE TABLE IF NOT EXISTS noticia_imagenes (
  id SERIAL PRIMARY KEY,
  noticia_id INT NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
  ruta_archivo VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  orden INT DEFAULT 0,
  fecha_subida TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_noticia_imagenes_noticia ON noticia_imagenes(noticia_id);

-- ============================================
-- DATOS INICIALES (SEED)
-- ============================================

-- Roles base
INSERT INTO roles (nombre) VALUES
  ('super_admin'),
  ('portal_admin'),
  ('rh_admin'),
  ('rh_empleado'),
  ('tickets_admin'),
  ('tickets_tecnico'),
  ('bi_admin'),
  ('bi_viewer'),
  ('comercial_admin'),
  ('auditoria_viewer')
ON CONFLICT (nombre) DO NOTHING;

-- Permisos base
INSERT INTO permisos (nombre) VALUES
  ('portal.view'),
  ('portal.admin'),
  ('portal.crear-noticias'),
  ('rh.view'),
  ('rh.admin'),
  ('rh.gestionar-permisos'),
  ('rh.ver-recibos'),
  ('tickets.view'),
  ('tickets.create'),
  ('tickets.admin'),
  ('tickets.technician'),
  ('bi.view'),
  ('bi.admin'),
  ('bi.gestionar-grupos'),
  ('comercial.view'),
  ('comercial.create'),
  ('comercial.admin'),
  ('auditoria.view')
ON CONFLICT (nombre) DO NOTHING;

-- Asignar permisos al rol super_admin
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.nombre = 'super_admin'
ON CONFLICT DO NOTHING;

-- Asignar permisos al rol portal_admin
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.nombre = 'portal_admin'
  AND p.nombre IN ('portal.view', 'portal.admin', 'portal.crear-noticias')
ON CONFLICT DO NOTHING;

-- Módulos base (tickets y rh activos)
INSERT INTO modulos (nombre, path_reactivo, descripcion, activo) VALUES
  ('portal',    '/',          'Portal central de la intranet',       true),
  ('auditoria', '/auditoria', 'Módulo de auditoría transversal',     true),
  ('tickets',   '/tickets',   'Tickets de soporte TI',               true),
  ('rh',        '/rh',        'Recursos Humanos',                    true),
  ('bi',        '/bi',        'Business Intelligence',               false),
  ('comercial', '/comercial', 'Cotizaciones y listas de precios',    false)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- USUARIOS DE PRUEBA
-- admin@rayhsa.com.mx        → Admin123!
-- portal@rayhsa.com.mx       → Portal123!
-- auditoria@rayhsa.com.mx    → Auditoria123!
-- rh@rayhsa.com.mx           → Rh123!
-- empleado@rayhsa.com.mx     → Empleado123!
-- tickets@rayhsa.com.mx      → Tickets123!
-- tecnico@rayhsa.com.mx      → Tecnico123!
-- ============================================
INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, hash_password, activo) VALUES
  ('admin@rayhsa.com.mx',     'Super',   'Admin',    'local', '$2b$10$j0ocH.ZStdD1LD36spnMZeE/quNQLQr/RhC2M6vrAMQHKh/gLX4qe', true),
  ('portal@rayhsa.com.mx',    'Portal',  'Admin',    'local', '$2b$10$BN201A2PNES0eL5kF0QgS.zESEv/ppKXN3Vq1..P8pIbb6qhSwUcK', true),
  ('auditoria@rayhsa.com.mx', 'Auditor', 'Viewer',   'local', '$2b$10$bHYvgo1OthTEdNc4uumpb.Q8C4aZeX.EQyAETuPpDGt91lq7uDhpi', true),
  ('rh@rayhsa.com.mx',        'RH',      'Admin',    'local', '$2b$10$Yjj76UHHuxhHVVgB/SKdhOwhBKLJ8jk9L.vUcjlNqs63CHrAFdYT.', true),
  ('empleado@rayhsa.com.mx',  'RH',      'Empleado', 'local', '$2b$10$WOefWZu/ZxUBpITmnLuMyOAKr9NwybUKbG0RpdbgXgt99C0Msg8VS',  true),
  ('tickets@rayhsa.com.mx',   'Tickets', 'Admin',    'local', '$2b$10$h0sGFq7.FAdfiagp4pUQO.cuSwxPp1SimPwIZLPjiqSFffpAKxaSa',  true),
  ('tecnico@rayhsa.com.mx',   'Tickets', 'Tecnico',  'local', '$2b$10$hNqv4lIGXLfn9uvZ.6NjPuZ9IRtZ1xV.bVV09W0gBWJLevPYPY9QO', true)
ON CONFLICT (correo) DO NOTHING;

-- Asignar roles a usuarios
INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u, roles r
WHERE (u.correo = 'admin@rayhsa.com.mx'     AND r.nombre = 'super_admin')
   OR (u.correo = 'portal@rayhsa.com.mx'    AND r.nombre = 'portal_admin')
   OR (u.correo = 'auditoria@rayhsa.com.mx' AND r.nombre = 'auditoria_viewer')
   OR (u.correo = 'rh@rayhsa.com.mx'        AND r.nombre = 'rh_admin')
   OR (u.correo = 'empleado@rayhsa.com.mx'  AND r.nombre = 'rh_empleado')
   OR (u.correo = 'tickets@rayhsa.com.mx'   AND r.nombre = 'tickets_admin')
   OR (u.correo = 'tecnico@rayhsa.com.mx'   AND r.nombre = 'tickets_tecnico')
ON CONFLICT DO NOTHING;

-- ============================================
-- TABLAS DEL MÓDULO RH
-- ============================================

-- Catálogos de RH
CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ubicaciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion TEXT,
  ciudad VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal VARCHAR(10),
  telefono VARCHAR(20),
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS puestos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  departamento_id INT REFERENCES departamentos(id),
  nivel_salarial VARCHAR(50),
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empleados (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  fecha_nacimiento DATE,
  curp VARCHAR(18),
  rfc VARCHAR(13),
  puesto VARCHAR(100),
  departamento VARCHAR(100),
  fecha_ingreso DATE,
  jefe_inmediato_id INT REFERENCES empleados(id),
  estatus VARCHAR(20) DEFAULT 'activo',
  puesto_id INT REFERENCES puestos(id),
  departamento_id INT REFERENCES departamentos(id),
  ubicacion_id INT REFERENCES ubicaciones(id),
  fecha_baja DATE,
  motivo_baja TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permisos_ausencia (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo VARCHAR(30) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  motivo TEXT,
  estatus VARCHAR(20) DEFAULT 'pendiente',
  fecha_solicitud TIMESTAMP DEFAULT NOW(),
  fecha_respuesta TIMESTAMP,
  respondedor_id INT REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS expediente_documentos (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo_documento VARCHAR(50) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  descripcion TEXT,
  fecha_subida TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recibos_nomina (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  periodo VARCHAR(20) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  fecha_generacion TIMESTAMP DEFAULT NOW()
);

-- Empleado de prueba vinculado al usuario rh_empleado
INSERT INTO empleados (usuario_id, nombre, apellido, fecha_ingreso, estatus)
SELECT u.id, 'María', 'Empleado', '2024-01-15', 'activo'
FROM usuarios u WHERE u.correo = 'empleado@rayhsa.com.mx'
ON CONFLICT DO NOTHING;

-- ============================================
-- TABLAS DEL MÓDULO TICKETS
-- ============================================

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  solicitante_id INT REFERENCES usuarios(id),
  tecnico_id INT REFERENCES usuarios(id),
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(50),
  nivel_atencion VARCHAR(20) DEFAULT 'bajo',
  estado VARCHAR(20) DEFAULT 'abierto',
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP,
  fecha_cierre TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_adjuntos (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  ruta_archivo VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  tipo_archivo VARCHAR(100),
  fecha_subida TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_encuestas (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  calificacion INT CHECK (calificacion >= 1 AND calificacion <= 5),
  comentarios TEXT,
  fecha_respuesta TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono VARCHAR(50) DEFAULT 'cog',
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

INSERT INTO ticket_categorias (nombre, descripcion, icono) VALUES
  ('Soporte TI',       'Problemas técnicos de hardware y software', 'computer'),
  ('Recursos Humanos', 'Consultas y trámites de RH',                'users'),
  ('Administrativo',   'Trámites administrativos generales',        'folder'),
  ('Instalaciones',    'Mantenimiento y espacios físicos',          'building'),
  ('Otro',             'Otros tipos de solicitudes',                'cog')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- MODELO DE PERMISOS GRANULAR (Fase 2)
-- ============================================

CREATE TABLE IF NOT EXISTS modulo_opciones (
  id SERIAL PRIMARY KEY,
  modulo_id INT NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

CREATE TABLE IF NOT EXISTS rol_opcion_permisos (
  rol_id   INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  opcion_id INT NOT NULL REFERENCES modulo_opciones(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);

-- Opciones por módulo
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, opc.nombre, opc.descripcion, opc.orden
FROM modulos m
JOIN (VALUES
  ('portal',    'Noticias',    'Gestión de noticias del portal',         1),
  ('portal',    'Usuarios',    'Gestión de usuarios del sistema',        2),
  ('portal',    'Roles',       'Administración de roles y permisos',     3),
  ('portal',    'Módulos',     'Activación y configuración de módulos',  4),
  ('tickets',   'Tickets',     'Gestión de tickets de soporte',          1),
  ('tickets',   'Categorías',  'Categorías de tickets',                  2),
  ('tickets',   'Adjuntos',    'Archivos adjuntos de tickets',           3),
  ('tickets',   'Encuestas',   'Encuestas de satisfacción',              4),
  ('rh',        'Empleados',   'Alta, baja y modificación de empleados', 1),
  ('rh',        'Expedientes', 'Documentos de expediente laboral',       2),
  ('rh',        'Permisos',    'Solicitudes de permisos y ausencias',    3),
  ('rh',        'Recibos',     'Recibos de nómina',                      4),
  ('auditoria', 'Logs',        'Registros de auditoría del sistema',     1)
) AS opc(modulo_nombre, nombre, descripcion, orden)
ON m.nombre = opc.modulo_nombre
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- super_admin: todos los permisos
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
CROSS JOIN modulo_opciones mo
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'super_admin'
ON CONFLICT DO NOTHING;

-- portal_admin: acceso total al módulo portal
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'portal'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'portal_admin'
ON CONFLICT DO NOTHING;

-- auditoria_viewer: solo consulta de logs
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, 'consulta'
FROM roles r
JOIN modulos m ON m.nombre = 'auditoria'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
WHERE r.nombre = 'auditoria_viewer'
ON CONFLICT DO NOTHING;

-- rh_admin: acceso total al módulo rh
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'rh_admin'
ON CONFLICT DO NOTHING;

-- rh_empleado: consulta y edicion de permisos (puede solicitar) + consulta de recibos
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
JOIN (VALUES ('Permisos', 'consulta'), ('Permisos', 'edicion'), ('Recibos', 'consulta')) AS t(opcion, tipo)
  ON mo.nombre = t.opcion
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

-- tickets_admin: acceso total al módulo tickets
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'tickets'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'tickets_admin'
ON CONFLICT DO NOTHING;

-- tickets_tecnico: gestión de tickets y adjuntos, consulta encuestas y categorías
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'tickets'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
JOIN (VALUES
  ('Tickets',    'consulta'),
  ('Tickets',    'edicion'),
  ('Adjuntos',   'consulta'),
  ('Adjuntos',   'edicion'),
  ('Encuestas',  'consulta'),
  ('Categorías', 'consulta')
) AS t(opcion_nombre, tipo) ON t.opcion_nombre = mo.nombre
WHERE r.nombre = 'tickets_tecnico'
ON CONFLICT DO NOTHING;

