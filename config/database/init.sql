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
  auth_uid UUID UNIQUE,
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
  fecha_actualizacion TIMESTAMP,
  fecha_evento TIMESTAMPTZ,   -- solo tipo 'evento' (migración portal 006)
  lugar VARCHAR(255)          -- solo tipo 'evento'
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
  ('comercial', '/comercial', 'Cotizaciones y listas de precios',    true)
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
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  area_id INT REFERENCES areas(id),
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_departamentos_area ON departamentos(area_id);

CREATE TABLE IF NOT EXISTS ubicaciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion TEXT,
  ciudad VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal VARCHAR(10),
  telefono VARCHAR(20),
  prefijo VARCHAR(10),
  ultimo_folio INT NOT NULL DEFAULT 0,
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
  fecha_pago DATE,
  importe_total DECIMAL(10,2),
  ruta_archivo VARCHAR(500),
  descripcion TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  creado_por_id INT REFERENCES usuarios(id),
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
  ticket_id INT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  calificacion INT NOT NULL CHECK (calificacion >= 1 AND calificacion <= 5),
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
  ('rh',        'Vacaciones',  'Solicitudes y saldo de vacaciones',      5),
  ('rh',        'Ubicaciones', 'Catálogo de ubicaciones y folios',       6),
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

-- rh_empleado: consulta y edicion de permisos (puede solicitar) + consulta de recibos y de su propio expediente (ver rh/008)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
JOIN (VALUES ('Permisos', 'consulta'), ('Permisos', 'edicion'), ('Recibos', 'consulta'), ('Expedientes', 'consulta')) AS t(opcion, tipo)
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

-- ============================================
-- MIGRACIÓN: Campos extendidos de empleados
-- ============================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empleados' AND column_name = 'apellido'
  ) THEN
    ALTER TABLE empleados RENAME COLUMN apellido TO apellido_paterno;
  END IF;
END $$;

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS apellido_materno VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS nss VARCHAR(11);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS infonavit VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fonacot VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS numero_nomina VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_imss DATE;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_renovacion DATE;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS celular_corporativo VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS estado_nacimiento VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS genero VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS escolaridad VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS celular_personal VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono_emergencia VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS parentesco_emergencia VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS correo_personal VARCHAR(255);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS calle VARCHAR(255);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS colonia VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(10);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS municipio VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS estado_residencia VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS banco VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS clabe VARCHAR(18);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS cp_fiscal VARCHAR(10);

CREATE TABLE IF NOT EXISTS empleado_hijos (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  nombre VARCHAR(100),
  fecha_nacimiento DATE,
  escolaridad VARCHAR(50),
  orden INT DEFAULT 0,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MÓDULO COMERCIAL: Solicitudes de Crédito
-- ============================================

CREATE TABLE IF NOT EXISTS solicitudes_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_solicitud VARCHAR(20) UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  rfc VARCHAR(20) NOT NULL,
  tipo_cliente VARCHAR(20) NOT NULL CHECK (tipo_cliente IN ('INDUSTRIA', 'DISTRIBUCION')),
  sucursal VARCHAR(100),
  regimen_fiscal VARCHAR(50),
  moneda VARCHAR(5) DEFAULT 'MN',
  giro_negocio VARCHAR(100),
  metodo_pago VARCHAR(50),
  uso_cfdi VARCHAR(20),
  forma_pago JSONB DEFAULT '[]',
  domicilio_fiscal JSONB DEFAULT '{}',
  domicilio_entrega JSONB DEFAULT '{}',
  datos_bancarios_nacionales JSONB DEFAULT '[]',
  datos_bancarios_extranjeros JSONB DEFAULT '[]',
  condiciones_comerciales JSONB DEFAULT '{}',
  contactos JSONB DEFAULT '[]',
  referencias_comerciales JSONB DEFAULT '[]',
  datos_proporcionados_nombre VARCHAR(255),
  datos_proporcionados_puesto VARCHAR(255),
  estado VARCHAR(30) DEFAULT 'borrador' CHECK (estado IN ('borrador','guardada','enviada_mba3','aprobada','rechazada')),
  sincronizado_mba3 BOOLEAN DEFAULT false,
  referencia_mba3 VARCHAR(100),
  usuario_creador_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_ultimo_cambio_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_ultimo_cambio TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_rfc ON solicitudes_credito(rfc);
CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_estado ON solicitudes_credito(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_usuario ON solicitudes_credito(usuario_creador_id);

CREATE OR REPLACE FUNCTION generar_numero_solicitud()
RETURNS TRIGGER AS $$
DECLARE
  año INT := EXTRACT(YEAR FROM NOW());
  secuencia INT;
BEGIN
  SELECT COUNT(*) + 1 INTO secuencia
  FROM solicitudes_credito
  WHERE EXTRACT(YEAR FROM fecha_creacion) = año;
  NEW.numero_solicitud := 'SC-' || año || '-' || LPAD(secuencia::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_numero_solicitud
BEFORE INSERT ON solicitudes_credito
FOR EACH ROW
WHEN (NEW.numero_solicitud IS NULL)
EXECUTE FUNCTION generar_numero_solicitud();

INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, 'Solicitudes de Crédito', 'Captura y gestión de solicitudes de crédito a clientes', 1
FROM modulos m
WHERE m.nombre = 'comercial'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'comercial'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Solicitudes de Crédito'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('super_admin', 'portal_admin')
ON CONFLICT DO NOTHING;

-- ============================================
-- MÓDULO RH: Vacaciones (origen: modules/rh/backend/migrations/002-solicitudes-vacaciones.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS tabla_calculo_vacaciones (
  anios_inicio INT PRIMARY KEY,
  anios_fin INT NOT NULL,
  dias_vacaciones INT NOT NULL
);

INSERT INTO tabla_calculo_vacaciones (anios_inicio, anios_fin, dias_vacaciones) VALUES
(1,1,12),(2,2,14),(3,3,16),(4,4,18),(5,5,20),
(6,10,22),(11,15,24),(16,20,26),(21,25,28),(26,30,30),
(31,35,32),(36,40,34),(41,45,36),(46,50,38),(51,55,40),(56,60,42)
ON CONFLICT (anios_inicio) DO NOTHING;

CREATE TABLE IF NOT EXISTS solicitudes_vacaciones (
  id SERIAL PRIMARY KEY,
  fecha_solicitud TIMESTAMP DEFAULT NOW(),
  empleado_id INT REFERENCES empleados(id),
  numero_nomina VARCHAR(50),
  nombre VARCHAR(200),
  apellido_paterno VARCHAR(100),
  apellido_materno VARCHAR(100),
  fecha_imss DATE,
  antiguedad INT,
  ubicacion VARCHAR(100),
  departamento VARCHAR(100),
  jefe_inmediato_id INT,
  jefe_nombre VARCHAR(200),
  fecha_inicial DATE NOT NULL,
  fecha_final DATE NOT NULL,
  fecha_regreso DATE,
  periodo INT NOT NULL,
  dias_periodo INT NOT NULL,
  dias_disfrutados INT NOT NULL DEFAULT 0,
  dias_pendientes_inicial INT NOT NULL,
  dias_a_disfrutar INT NOT NULL,
  dias_pendientes_final INT NOT NULL,
  observaciones TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estatus IN ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo TEXT,
  autoriza_id INT REFERENCES usuarios(id),
  autoriza_nombre VARCHAR(200),
  fecha_autoriza TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_vac_empleado ON solicitudes_vacaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_sol_vac_estatus ON solicitudes_vacaciones(estatus);
CREATE INDEX IF NOT EXISTS idx_sol_vac_periodo ON solicitudes_vacaciones(periodo);
CREATE INDEX IF NOT EXISTS idx_sol_vac_jefe ON solicitudes_vacaciones(jefe_inmediato_id);

-- ============================================
-- MÓDULO TICKETS: Comentarios (origen: modules/tickets/backend/migrations/002-ticket-comentarios.sql)
-- ============================================
-- Comentarios de tickets (modelo ticketComentario.model.js).
-- La tabla se usaba en código pero no existía en ninguna migración ni en init.sql.
CREATE TABLE IF NOT EXISTS ticket_comentarios (
  id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id),
  comentario TEXT NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comentarios_ticket ON ticket_comentarios(ticket_id);

-- ============================================
-- MÓDULO RH: Calendario laboral y cupo de vacaciones (origen: modules/rh/backend/migrations/009-calendario-laboral.sql)
-- ============================================

-- a) Calendario laboral (aplica a toda la empresa). Una fila por fecha+tipo:
--    puede haber un 'evento' y un 'oficial' el mismo día.
CREATE TABLE IF NOT EXISTS calendario_laboral (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('oficial', 'otorgado', 'evento')),
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP DEFAULT NOW(),
  UNIQUE (fecha, tipo)
);
CREATE INDEX IF NOT EXISTS idx_calendario_laboral_fecha ON calendario_laboral(fecha);

-- b) Cupo de vacaciones: máximo de personas del departamento de vacaciones a la vez.
ALTER TABLE departamentos
  ADD COLUMN IF NOT EXISTS cupo_vacaciones INT NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departamentos_cupo_vacaciones_check' AND conrelid = 'departamentos'::regclass
  ) THEN
    ALTER TABLE departamentos
      ADD CONSTRAINT departamentos_cupo_vacaciones_check CHECK (cupo_vacaciones >= 1);
  END IF;
END $$;

-- c) Departamento (id) de la solicitud al crearla; filas existentes se rellenan con el actual del empleado.
ALTER TABLE solicitudes_vacaciones
  ADD COLUMN IF NOT EXISTS departamento_id INT REFERENCES departamentos(id);
UPDATE solicitudes_vacaciones s
SET departamento_id = e.departamento_id
FROM empleados e
WHERE e.id = s.empleado_id
  AND s.departamento_id IS NULL
  AND e.departamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sol_vac_depto_fechas
  ON solicitudes_vacaciones(departamento_id, estatus, fecha_inicial, fecha_final);

-- d) Permisos. Los tipos reales de rol_opcion_permisos son solo 'consulta' y 'edicion'
--    (CHECK de la tabla): 'edicion' cubre alta, cambio y baja.
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, o.nombre, o.descripcion, o.orden
FROM modulos m
JOIN (VALUES
  ('Calendario',    'Calendario laboral: festivos, descansos otorgados y eventos', 7),
  ('Departamentos', 'Catálogo de departamentos y cupo de vacaciones',              8)
) AS o(nombre, descripcion, orden) ON true
WHERE m.nombre = 'rh'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- Lectura del calendario: todos los roles que ya tienen Vacaciones (consulta o edicion)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT DISTINCT rop.rol_id, cal.id, 'consulta'
FROM rol_opcion_permisos rop
JOIN modulo_opciones vac ON vac.id = rop.opcion_id AND vac.nombre = 'Vacaciones'
JOIN modulos m ON m.id = vac.modulo_id AND m.nombre = 'rh'
JOIN modulo_opciones cal ON cal.modulo_id = m.id AND cal.nombre = 'Calendario'
ON CONFLICT DO NOTHING;

-- rh_empleado siempre lee (en bases nuevas su Vacaciones llega con la semilla, después de init.sql)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, 'consulta'
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Calendario'
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

-- Administración del calendario: rh_admin, super_admin y portal_admin (este último solo esta opción)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Calendario'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('rh_admin', 'super_admin', 'portal_admin')
ON CONFLICT DO NOTHING;

-- Departamentos: hoy da 403 a rh_admin en /api/departamentos porque la opción no estaba sembrada
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Departamentos'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('rh_admin', 'super_admin')
ON CONFLICT DO NOTHING;

-- e) Festivos oficiales de ley de México 2026 y 2027 (editables por RH).
--    Solo se siembran si la tabla está vacía: así un festivo borrado por RH no reaparece en cada db-init.
INSERT INTO calendario_laboral (fecha, tipo, nombre)
SELECT v.fecha::date, v.tipo, v.nombre
FROM (VALUES
  ('2026-01-01', 'oficial', 'Año Nuevo'),
  ('2026-02-02', 'oficial', 'Día de la Constitución'),
  ('2026-03-16', 'oficial', 'Natalicio de Benito Juárez'),
  ('2026-05-01', 'oficial', 'Día del Trabajo'),
  ('2026-09-16', 'oficial', 'Día de la Independencia'),
  ('2026-11-16', 'oficial', 'Día de la Revolución Mexicana'),
  ('2026-12-25', 'oficial', 'Navidad'),
  ('2027-01-01', 'oficial', 'Año Nuevo'),
  ('2027-02-01', 'oficial', 'Día de la Constitución'),
  ('2027-03-15', 'oficial', 'Natalicio de Benito Juárez'),
  ('2027-05-01', 'oficial', 'Día del Trabajo'),
  ('2027-09-16', 'oficial', 'Día de la Independencia'),
  ('2027-11-15', 'oficial', 'Día de la Revolución Mexicana'),
  ('2027-12-25', 'oficial', 'Navidad')
) AS v(fecha, tipo, nombre)
WHERE NOT EXISTS (SELECT 1 FROM calendario_laboral)
ON CONFLICT (fecha, tipo) DO NOTHING;


-- ============================================
-- MÓDULO RH: un usuario, un empleado (origen: modules/rh/backend/migrations/010-empleados-usuario-unico.sql)
-- ============================================
-- Un usuario, un empleado: UNIQUE (usuario_id) en empleados.
-- La identidad de quien aprueba o rechaza vacaciones (y el "empleado propio" de cada acceso) se resuelve
-- por empleados.usuario_id; con filas duplicadas el empleado "propio" sería arbitrario.
-- Idempotente y SIN romper datos existentes: si ya hay una restricción única sobre usuario_id no hace
-- nada; si hay usuarios con más de un empleado NO falla ni borra nada: avisa (WARNING con los ids) y la
-- restricción queda sin crear hasta que RH corrija los duplicados y se vuelva a ejecutar el db-init.
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
DO $$
DECLARE
  duplicados TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'empleados'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND i.indpred IS NULL
      AND a.attname = 'usuario_id'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(usuario_id::text || ' (empleados ' || ids || ')', ', ' ORDER BY usuario_id)
    INTO duplicados
  FROM (
    SELECT usuario_id, string_agg(id::text, ',' ORDER BY id) AS ids
    FROM empleados
    WHERE usuario_id IS NOT NULL
    GROUP BY usuario_id
    HAVING COUNT(*) > 1
  ) d;

  IF duplicados IS NOT NULL THEN
    RAISE WARNING 'empleados.usuario_id NO es unico todavia: hay usuarios con mas de un empleado: %. Corrige los duplicados y vuelve a ejecutar esta migracion.', duplicados;
  ELSE
    ALTER TABLE empleados ADD CONSTRAINT empleados_usuario_id_unique UNIQUE (usuario_id);
  END IF;
END $$;


-- ============================================
-- MÓDULO RH: tipo 'actividad' en el calendario laboral (origen: modules/rh/backend/migrations/011-calendario-actividad.sql)
-- ============================================
-- Nuevo tipo de fecha del calendario laboral: 'actividad' (Día Actividad Empresa).
-- Bloquea las vacaciones de todos en esa fecha (si cae en día hábil). Amplía el CHECK de
-- calendario_laboral.tipo a: oficial, otorgado, evento, actividad.
-- Idempotente y sin tocar datos: la restricción actual de tipo (se busca por definición, no por nombre,
-- porque el CHECK en línea de la 009 recibe un nombre automático) se elimina y se vuelve a crear con el
-- nombre fijo calendario_laboral_tipo_check; si ya admite 'actividad' no hace nada.
-- Depende de: 009-calendario-laboral.sql.
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
DO $$
DECLARE
  restriccion RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'calendario_laboral'::regclass
      AND contype = 'c'
      AND conname = 'calendario_laboral_tipo_check'
      AND pg_get_constraintdef(oid) LIKE '%actividad%'
  ) THEN
    RETURN;
  END IF;

  FOR restriccion IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'calendario_laboral'::regclass
      AND contype = 'c'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'calendario_laboral'::regclass AND attname = 'tipo')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE calendario_laboral DROP CONSTRAINT %I', restriccion.conname);
  END LOOP;

  ALTER TABLE calendario_laboral
    ADD CONSTRAINT calendario_laboral_tipo_check
    CHECK (tipo IN ('oficial', 'otorgado', 'evento', 'actividad'));
END $$;


-- ============================================
-- MÓDULO RH: asistencia (origen: modules/rh/backend/migrations/012-asistencia.sql)
-- ============================================
-- Módulo de asistencia (Fase 2): turnos, asignaciones con vigencia, marcas crudas, sincronización,
-- asistencia diaria calculada, incidencias, permisos y RLS.
-- Idempotente: se puede re-ejecutar sin efectos secundarios (no toca datos existentes).
-- Depende de: init.sql (usuarios, empleados, departamentos, solicitudes_vacaciones, permisos_ausencia,
--   modulo_opciones, rol_opcion_permisos) y de 009-calendario-laboral.sql (calendario_laboral).
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
-- Las horas de los turnos son hora local America/Mexico_City (TIME sin zona); las marcas son TIMESTAMPTZ.

-- Evita traslapes de vigencia con una restricción EXCLUDE (necesita btree_gist: es una extensión de
-- confianza, la crea el usuario postgres tanto en postgres:16 como en supabase/postgres 17). Si no se
-- puede crear, la migración FALLA a propósito (ON_ERROR_STOP) en vez de dejar la regla sin proteger.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- a) Turnos y su detalle por día de la semana.
--    "Nocturno" no es columna: se deriva de turno_dias.cruza_medianoche.
--    Alineado con att_timeinterval / att_attshift de BioTime (el esquema de turnos es propio de la intranet;
--    la interfaz traduce). Equivalencias:
--      BioTime in_time / duration            -> turno_dias.hora_entrada / hora_salida (duración = salida - entrada,
--                                               + 24 h si cruza_medianoche; la API la expone como duracion_min)
--      allow_late                            -> turnos.tolerancia_retardo_min (10)
--      allow_leave_early                     -> turnos.tolerancia_salida_min (3 en 'Rayhsa', 0 en 'Logística')
--      in_ahead_margin / in_above_margin     -> turnos.ventana_entrada_antes_min (60) / _despues_min (150)
--      out_ahead_margin / out_above_margin   -> turnos.ventana_salida_antes_min (5 o 0) / _despues_min (359)
--      att_breaktime (13:00, 60 min)         -> turnos.descanso_inicio / descanso_min (se descuenta; NO se checa)
--      umbral_falta_min: propio de la intranet (retardo mayor a este umbral = falta)
--    Numeración de día: BioTime 0 = domingo ... 6 = sábado; la intranet turno_dias.dia_semana 1 = lunes ... 7 = domingo
--    (BioTime 0 -> 7, 1..6 -> igual). BioTime corta el día a las 00:00 y no tiene turnos que crucen medianoche;
--    el esquema conserva el soporte nocturno.
CREATE TABLE IF NOT EXISTS turnos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  tolerancia_retardo_min INT NOT NULL DEFAULT 10 CHECK (tolerancia_retardo_min BETWEEN 0 AND 720),
  umbral_falta_min INT NOT NULL DEFAULT 30 CHECK (umbral_falta_min BETWEEN 0 AND 720),
  tolerancia_salida_min INT NOT NULL DEFAULT 0 CHECK (tolerancia_salida_min BETWEEN 0 AND 720),
  -- Ventanas (minutos) en las que una marca cuenta como entrada / salida del turno
  ventana_entrada_antes_min INT NOT NULL DEFAULT 60 CHECK (ventana_entrada_antes_min BETWEEN 0 AND 720),
  ventana_entrada_despues_min INT NOT NULL DEFAULT 150 CHECK (ventana_entrada_despues_min BETWEEN 0 AND 720),
  ventana_salida_antes_min INT NOT NULL DEFAULT 5 CHECK (ventana_salida_antes_min BETWEEN 0 AND 720),
  ventana_salida_despues_min INT NOT NULL DEFAULT 359 CHECK (ventana_salida_despues_min BETWEEN 0 AND 720),
  -- Descanso: se descuenta de la jornada y no se checa
  descanso_inicio TIME,
  descanso_min INT NOT NULL DEFAULT 0 CHECK (descanso_min BETWEEN 0 AND 720),
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP DEFAULT NOW(),
  CONSTRAINT turnos_umbral_check CHECK (umbral_falta_min >= tolerancia_retardo_min),
  CONSTRAINT turnos_descanso_check CHECK (descanso_min = 0 OR descanso_inicio IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_nombre ON turnos (lower(btrim(nombre)));
CREATE INDEX IF NOT EXISTS idx_turnos_activo ON turnos(activo);
CREATE INDEX IF NOT EXISTS idx_turnos_creado_por ON turnos(creado_por);

CREATE TABLE IF NOT EXISTS turno_dias (
  turno_id INT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7), -- ISO: 1 = lunes ... 7 = domingo
  laborable BOOLEAN NOT NULL,
  hora_entrada TIME,
  hora_salida TIME,
  cruza_medianoche BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (turno_id, dia_semana),
  -- Día laborable: entrada y salida distintas y cruza_medianoche coherente con las horas
  -- (salida < entrada = el turno termina al día siguiente). Día de descanso: sin horas.
  CONSTRAINT turno_dias_coherencia_check CHECK (
    (laborable
      AND hora_entrada IS NOT NULL AND hora_salida IS NOT NULL
      AND hora_entrada <> hora_salida
      AND cruza_medianoche = (hora_salida < hora_entrada))
    OR
    (NOT laborable
      AND hora_entrada IS NULL AND hora_salida IS NULL AND NOT cruza_medianoche)
  )
);

-- El descanso (descanso_inicio + descanso_min) debe caer dentro de la jornada de CADA día laborable del
-- turno: entre hora_entrada y hora_salida (si cruza la medianoche, la salida cuenta +24 h y un descanso
-- anterior a la entrada se toma del día siguiente). Es una regla entre turnos y turno_dias, así que va en
-- un trigger de restricción DIFERIDO (al COMMIT: el turno se inserta antes que su detalle y el detalle se
-- reemplaza en bloque). Un turno con días laborables más cortos que el descanso necesita otro turno.
CREATE OR REPLACE FUNCTION turno_descanso_dentro_jornada() RETURNS trigger AS $$
DECLARE
  id_turno INT;
  fuera RECORD;
BEGIN
  IF TG_TABLE_NAME = 'turnos' THEN
    id_turno := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    id_turno := OLD.turno_id;
  ELSE
    id_turno := NEW.turno_id;
  END IF;
  SELECT d.dia_semana INTO fuera
  FROM turnos t
  JOIN turno_dias d ON d.turno_id = t.id AND d.laborable
  CROSS JOIN LATERAL (SELECT
      EXTRACT(EPOCH FROM d.hora_entrada)::int / 60 AS ent,
      EXTRACT(EPOCH FROM d.hora_salida)::int / 60 + CASE WHEN d.cruza_medianoche THEN 1440 ELSE 0 END AS sal,
      EXTRACT(EPOCH FROM t.descanso_inicio)::int / 60 AS ini) AS m
  CROSS JOIN LATERAL (SELECT
      CASE WHEN d.cruza_medianoche AND m.ini < m.ent THEN m.ini + 1440 ELSE m.ini END AS ini) AS r
  WHERE t.id = id_turno AND t.descanso_min > 0
    AND (r.ini < m.ent OR r.ini + t.descanso_min > m.sal)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'turnos: el descanso queda fuera de la jornada del día %', fuera.dia_semana
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_turnos_descanso ON turnos;
CREATE CONSTRAINT TRIGGER trg_turnos_descanso
  AFTER INSERT OR UPDATE OF descanso_inicio, descanso_min ON turnos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION turno_descanso_dentro_jornada();
DROP TRIGGER IF EXISTS trg_turno_dias_descanso ON turno_dias;
CREATE CONSTRAINT TRIGGER trg_turno_dias_descanso
  AFTER INSERT OR UPDATE OR DELETE ON turno_dias
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION turno_descanso_dentro_jornada();

-- b) Asignaciones con vigencia (historial: las filas cerradas no se borran).
--    vigente_hasta NULL = abierta. Intervalos cerrados [desde, hasta]; sin traslape por departamento
--    y por empleado. Turno efectivo = asignación individual vigente; si no hay, la del departamento.
CREATE TABLE IF NOT EXISTS turno_departamento (
  id SERIAL PRIMARY KEY,
  departamento_id INT NOT NULL REFERENCES departamentos(id),
  turno_id INT NOT NULL REFERENCES turnos(id),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  CONSTRAINT turno_departamento_rango_check CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT turno_departamento_sin_traslape
    EXCLUDE USING gist (departamento_id WITH =, daterange(vigente_desde, vigente_hasta, '[]') WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_turno_departamento_turno ON turno_departamento(turno_id);
CREATE INDEX IF NOT EXISTS idx_turno_departamento_creado_por ON turno_departamento(creado_por);

CREATE TABLE IF NOT EXISTS turno_empleado (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  turno_id INT NOT NULL REFERENCES turnos(id),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  CONSTRAINT turno_empleado_rango_check CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT turno_empleado_sin_traslape
    EXCLUDE USING gist (empleado_id WITH =, daterange(vigente_desde, vigente_hasta, '[]') WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_turno_empleado_turno ON turno_empleado(turno_id);
CREATE INDEX IF NOT EXISTS idx_turno_empleado_creado_por ON turno_empleado(creado_por);

-- c) Marcas crudas y sincronización. Solo las toca el backend (la ingesta por API con llave es la
--    Fase 3; no hay rol de BD para la interfaz). La marca original no se modifica ni se borra nunca.
CREATE TABLE IF NOT EXISTS asistencia_sync_lotes (
  id BIGSERIAL PRIMARY KEY,
  origen VARCHAR(50) NOT NULL,
  ip VARCHAR(45),
  recibidas INT NOT NULL DEFAULT 0,
  insertadas INT NOT NULL DEFAULT 0,
  duplicadas INT NOT NULL DEFAULT 0,
  rechazadas INT NOT NULL DEFAULT 0,
  sin_empleado INT NOT NULL DEFAULT 0 CHECK (sin_empleado >= 0), -- marcas guardadas sin empleado conocido
  hash_cuerpo CHAR(64),
  -- Estado del envío (contrato v1): 'en_curso' al recibirlo, 'ok' o 'error' al terminar. El detalle del
  -- fallo va en `error`. Sin lote_externo: el contrato no lo envía y la idempotencia es por (origen, id_externo).
  estatus VARCHAR(20) NOT NULL DEFAULT 'en_curso',
  error TEXT,
  fecha_recepcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asistencia_sync_lotes_estatus_check CHECK (estatus IN ('en_curso', 'ok', 'error'))
);

CREATE TABLE IF NOT EXISTS asistencia_sync_estado (
  origen VARCHAR(50) PRIMARY KEY,
  ultima_marca_ts TIMESTAMPTZ,
  ultimo_id_externo BIGINT,          -- cursor: id de iclock_transaction (creciente, con huecos)
  ultima_subida_ts TIMESTAMPTZ,      -- upload_time más reciente recibido
  ultimo_lote_id BIGINT REFERENCES asistencia_sync_lotes(id),
  ultima_sincronizacion TIMESTAMPTZ,
  ultimo_error TEXT,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asistencia_sync_estado_lote ON asistencia_sync_estado(ultimo_lote_id);

CREATE TABLE IF NOT EXISTS asistencia_marcas (
  id BIGSERIAL PRIMARY KEY,
  origen VARCHAR(50) NOT NULL,
  id_externo VARCHAR(100) NOT NULL,
  codigo_empleado VARCHAR(50) NOT NULL,           -- = empleados.numero_nomina (texto tal cual llega)
  empleado_id INT REFERENCES empleados(id) ON DELETE SET NULL, -- NULL = código sin empleado conocido
  marca_ts TIMESTAMPTZ NOT NULL,                  -- punch_time: instante correcto; la interfaz envía UTC y se guarda tal cual
  subida_ts TIMESTAMPTZ,                          -- upload_time: cuándo la subió el checador (detecta marcas tardías)
  estado_marca VARCHAR(20),                       -- punch_state crudo (poco fiable, 98% '0'): entrada/salida se deduce con el turno
  tipo_verificacion VARCHAR(30),                  -- verify_type crudo
  terminal_sn VARCHAR(50),
  terminal_alias VARCHAR(100),
  area_externa VARCHAR(100),
  crudo JSONB,                                    -- work_code, source, is_attendance, etc.
  lote_id BIGINT REFERENCES asistencia_sync_lotes(id),
  fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asistencia_marcas_origen_externo_key UNIQUE (origen, id_externo)
);
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_codigo_ts ON asistencia_marcas(codigo_empleado, marca_ts);
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_empleado_ts ON asistencia_marcas(empleado_id, marca_ts);
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_ts ON asistencia_marcas(marca_ts);
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_subida ON asistencia_marcas(subida_ts);
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_lote ON asistencia_marcas(lote_id);

-- Inmutabilidad: lo único que puede cambiar en una marca es empleado_id (vincularla cuando el
-- empleado se da de alta o se corrige su número de nómina). No se borran (retención: siempre).
CREATE OR REPLACE FUNCTION asistencia_marcas_inmutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'asistencia_marcas: las marcas no se borran' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.id, NEW.origen, NEW.id_externo, NEW.codigo_empleado, NEW.marca_ts, NEW.subida_ts, NEW.estado_marca,
      NEW.tipo_verificacion, NEW.terminal_sn, NEW.terminal_alias, NEW.area_externa, NEW.crudo,
      NEW.lote_id, NEW.fecha_importacion)
     IS DISTINCT FROM
     (OLD.id, OLD.origen, OLD.id_externo, OLD.codigo_empleado, OLD.marca_ts, OLD.subida_ts, OLD.estado_marca,
      OLD.tipo_verificacion, OLD.terminal_sn, OLD.terminal_alias, OLD.area_externa, OLD.crudo,
      OLD.lote_id, OLD.fecha_importacion) THEN
    RAISE EXCEPTION 'asistencia_marcas: la marca original no se modifica' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asistencia_marcas_inmutable ON asistencia_marcas;
CREATE TRIGGER trg_asistencia_marcas_inmutable
  BEFORE UPDATE OR DELETE ON asistencia_marcas
  FOR EACH ROW EXECUTE FUNCTION asistencia_marcas_inmutable();

-- d) Incidencias (justificaciones y correcciones de RH) y asistencia diaria calculada.
--    Solo el esquema: la lógica de cálculo es de la Fase 4. La marca original NUNCA se modifica:
--    una corrección es una incidencia que apunta a ella (marca_id) y propone otra hora.
CREATE TABLE IF NOT EXISTS asistencia_incidencias (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id),
  fecha DATE NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  motivo TEXT NOT NULL CHECK (btrim(motivo) <> ''),
  marca_id BIGINT REFERENCES asistencia_marcas(id),
  marca_ts_corregida TIMESTAMPTZ,
  activa BOOLEAN NOT NULL DEFAULT true,
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP DEFAULT NOW(),
  CONSTRAINT asistencia_incidencias_tipo_check CHECK (tipo IN ('justificacion', 'correccion_marca', 'otro')),
  -- Una corrección apunta a la marca y propone otra hora; la hora propuesta no existe sin marca
  CONSTRAINT asistencia_incidencias_correccion_check CHECK (
    (tipo <> 'correccion_marca' OR (marca_id IS NOT NULL AND marca_ts_corregida IS NOT NULL))
    AND (marca_ts_corregida IS NULL OR (marca_id IS NOT NULL AND tipo = 'correccion_marca'))
  )
);
CREATE INDEX IF NOT EXISTS idx_asistencia_incidencias_empleado_fecha ON asistencia_incidencias(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_incidencias_marca ON asistencia_incidencias(marca_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_incidencias_creado_por ON asistencia_incidencias(creado_por);

-- La marca referenciada debe ser DEL MISMO empleado de la incidencia (una marca huérfana, sin empleado
-- vinculado, tampoco sirve). No cubre que la marca se re-vincule después a otro empleado (la
-- vinculación solo llena empleados huérfanos); la Fase 4 debe revalidarlo si cambia empleado_id.
CREATE OR REPLACE FUNCTION asistencia_incidencia_marca_coherente() RETURNS trigger AS $$
DECLARE
  empleado_marca INT;
BEGIN
  IF NEW.marca_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT m.empleado_id INTO empleado_marca FROM asistencia_marcas m WHERE m.id = NEW.marca_id;
  IF empleado_marca IS DISTINCT FROM NEW.empleado_id THEN
    RAISE EXCEPTION 'asistencia_incidencias: la marca % no pertenece al empleado %', NEW.marca_id, NEW.empleado_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asistencia_incidencia_marca ON asistencia_incidencias;
CREATE TRIGGER trg_asistencia_incidencia_marca
  BEFORE INSERT OR UPDATE OF empleado_id, marca_id ON asistencia_incidencias
  FOR EACH ROW EXECUTE FUNCTION asistencia_incidencia_marca_coherente();

CREATE TABLE IF NOT EXISTS asistencia_diaria (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  turno_id INT REFERENCES turnos(id),
  primera_marca TIMESTAMPTZ,
  ultima_marca TIMESTAMPTZ,
  minutos_retardo INT CHECK (minutos_retardo IS NULL OR minutos_retardo >= 0),
  minutos_salida_anticipada INT CHECK (minutos_salida_anticipada IS NULL OR minutos_salida_anticipada >= 0),
  estatus VARCHAR(20) NOT NULL,
  solicitud_vacaciones_id INT REFERENCES solicitudes_vacaciones(id) ON DELETE SET NULL,
  permiso_id INT REFERENCES permisos_ausencia(id) ON DELETE SET NULL,
  calendario_id INT REFERENCES calendario_laboral(id) ON DELETE SET NULL,
  incidencia_id INT REFERENCES asistencia_incidencias(id) ON DELETE SET NULL,
  version_calculo SMALLINT NOT NULL DEFAULT 1,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asistencia_diaria_empleado_fecha_key UNIQUE (empleado_id, fecha),
  CONSTRAINT asistencia_diaria_estatus_check CHECK (estatus IN (
    'puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'vacaciones',
    'permiso', 'descanso', 'festivo', 'justificada', 'sin_turno'))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_fecha ON asistencia_diaria(fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_estatus_fecha ON asistencia_diaria(estatus, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_turno ON asistencia_diaria(turno_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_solicitud ON asistencia_diaria(solicitud_vacaciones_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_permiso ON asistencia_diaria(permiso_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_calendario ON asistencia_diaria(calendario_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_incidencia ON asistencia_diaria(incidencia_id);

-- e) RLS deny-all en las tablas nuevas (decisión 2026-10-08: el único acceso a datos es el backend,
--    conectado como postgres). Igual que 004, en la propia migración, para no depender del orden del
--    db-init. anon/authenticated no reciben ningún privilegio.
ALTER TABLE turnos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_dias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_departamento     ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_empleado         ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_sync_lotes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_sync_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_marcas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_diaria      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON turnos, turno_dias, turno_departamento, turno_empleado, asistencia_sync_lotes,
                  asistencia_sync_estado, asistencia_marcas, asistencia_incidencias, asistencia_diaria
      FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE turnos_id_seq, turno_departamento_id_seq, turno_empleado_id_seq,
                           asistencia_sync_lotes_id_seq, asistencia_marcas_id_seq,
                           asistencia_incidencias_id_seq, asistencia_diaria_id_seq
      FROM anon, authenticated;
    REVOKE ALL ON FUNCTION asistencia_marcas_inmutable() FROM anon, authenticated;
    REVOKE ALL ON FUNCTION asistencia_incidencia_marca_coherente() FROM anon, authenticated;
    REVOKE ALL ON FUNCTION turno_descanso_dentro_jornada() FROM anon, authenticated;
  END IF;
END $$;

-- Semilla inicial (solo si turnos está vacía, como los festivos: un turno borrado por RH no resucita
-- mientras exista otro). Réplica de los intervalos de BioTime 'Rayhsa' y 'LOGÍSTICA'. NO se asigna a
-- ningún departamento: los define RH.
DO $$
DECLARE
  nombre_turno TEXT;
  id_turno INT;
BEGIN
  IF EXISTS (SELECT 1 FROM turnos) THEN
    RETURN;
  END IF;
  FOREACH nombre_turno IN ARRAY ARRAY['Rayhsa', 'Logística'] LOOP
    INSERT INTO turnos (nombre, descripcion, tolerancia_retardo_min, umbral_falta_min, tolerancia_salida_min,
                        ventana_entrada_antes_min, ventana_entrada_despues_min,
                        ventana_salida_antes_min, ventana_salida_despues_min, descanso_inicio, descanso_min)
    VALUES (
      nombre_turno,
      'Lunes a viernes de 08:00 a 18:00 (10 h con 1 h de descanso a las 13:00); sábado y domingo descanso',
      10, 30,
      CASE WHEN nombre_turno = 'Rayhsa' THEN 3 ELSE 0 END,
      60, 150,
      CASE WHEN nombre_turno = 'Rayhsa' THEN 5 ELSE 0 END,
      359, '13:00', 60)
    RETURNING id INTO id_turno;
    INSERT INTO turno_dias (turno_id, dia_semana, laborable, hora_entrada, hora_salida, cruza_medianoche)
    SELECT id_turno, d, d <= 5,
           CASE WHEN d <= 5 THEN TIME '08:00' END,
           CASE WHEN d <= 5 THEN TIME '18:00' END,
           false
    FROM generate_series(1, 7) AS d;
  END LOOP;
END $$;

-- f) Permisos. Los tipos reales de rol_opcion_permisos son solo 'consulta' y 'edicion'.
--    Asistencia: lectura para los roles que ya tienen Vacaciones o Empleados (el filtrado por
--    propietario / jefe vigente / RH se hace en el controlador, como en vacaciones).
--    Turnos: catálogo y asignaciones, solo rh_admin y super_admin (NO portal_admin).
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, o.nombre, o.descripcion, o.orden
FROM modulos m
JOIN (VALUES
  ('Asistencia', 'Asistencia: marcas, retardos y faltas del personal', 9),
  ('Turnos',     'Turnos de trabajo y su asignación a departamentos y empleados', 10)
) AS o(nombre, descripcion, orden) ON true
WHERE m.nombre = 'rh'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT DISTINCT rop.rol_id, asi.id, 'consulta'
FROM rol_opcion_permisos rop
JOIN modulo_opciones prev ON prev.id = rop.opcion_id AND prev.nombre IN ('Vacaciones', 'Empleados')
JOIN modulos m ON m.id = prev.modulo_id AND m.nombre = 'rh'
JOIN modulo_opciones asi ON asi.modulo_id = m.id AND asi.nombre = 'Asistencia'
ON CONFLICT DO NOTHING;

-- rh_empleado siempre lee (en bases nuevas su Vacaciones llega con la semilla, después de init.sql)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, 'consulta'
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Asistencia'
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre IN ('Asistencia', 'Turnos')
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('rh_admin', 'super_admin')
ON CONFLICT DO NOTHING;
