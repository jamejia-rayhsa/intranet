-- modules/portal/backend/migrations/002-modelo-permisos-granular.sql

-- 1. Tabla de opciones por módulo
CREATE TABLE IF NOT EXISTS modulo_opciones (
  id SERIAL PRIMARY KEY,
  modulo_id INT NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

-- 2. Tabla de permisos por rol y opción
CREATE TABLE IF NOT EXISTS rol_opcion_permisos (
  rol_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  opcion_id INT NOT NULL REFERENCES modulo_opciones(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);

-- 3. Agregar rol_id directo a usuarios (un rol por usuario)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id INT REFERENCES roles(id);

-- 4. Migrar: copiar el primer rol de usuario_rol a usuarios.rol_id
UPDATE usuarios u
SET rol_id = (
  SELECT ur.rol_id FROM usuario_rol ur
  WHERE ur.usuario_id = u.id
  ORDER BY ur.rol_id
  LIMIT 1
)
WHERE u.rol_id IS NULL;

-- 5. Seed: insertar opciones iniciales por módulo
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, opc.nombre, opc.descripcion, opc.orden
FROM modulos m
JOIN (VALUES
  ('portal', 'Noticias',   'Gestión de noticias del portal',          1),
  ('portal', 'Usuarios',   'Gestión de usuarios del sistema',         2),
  ('portal', 'Roles',      'Administración de roles y permisos',      3),
  ('portal', 'Módulos',    'Activación y configuración de módulos',   4),
  ('tickets','Tickets',    'Gestión de tickets de soporte',           1),
  ('tickets','Categorías', 'Categorías de tickets',                   2),
  ('tickets','Adjuntos',   'Archivos adjuntos de tickets',            3),
  ('tickets','Encuestas',  'Encuestas de satisfacción',               4),
  ('rh',     'Empleados',  'Alta, baja y modificación de empleados',  1),
  ('rh',     'Expedientes','Documentos de expediente laboral',        2),
  ('rh',     'Permisos',   'Solicitudes de permisos y ausencias',     3),
  ('rh',     'Recibos',    'Recibos de nómina',                       4),
  ('auditoria','Logs',     'Registros de auditoría del sistema',      1)
) AS opc(modulo_nombre, nombre, descripcion, orden)
ON m.nombre = opc.modulo_nombre
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- 6. Dar al rol super_admin todos los permisos (consulta + edición)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
CROSS JOIN modulo_opciones mo
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'super_admin'
ON CONFLICT DO NOTHING;
