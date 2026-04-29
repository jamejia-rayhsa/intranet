-- ============================================
-- SEMILLA INICIAL: Datos base del Portal
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

-- Asignar todos los permisos al rol super_admin
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

-- Asignar permisos al rol rh_admin
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.nombre = 'rh_admin'
  AND p.nombre IN ('rh.view', 'rh.admin', 'rh.gestionar-permisos', 'rh.ver-recibos', 'portal.crear-noticias')
ON CONFLICT DO NOTHING;

-- Módulos base (tickets y rh activos)
INSERT INTO modulos (nombre, path_reactivo, descripcion, activo) VALUES
  ('portal',    '/',          'Portal central de la intranet',       true),
  ('auditoria', '/auditoria', 'Módulo de auditoría transversal',     true),
  ('tickets',   '/tickets',   'Tickets de soporte TI',               true),
  ('rh',        '/rh',        'Recursos Humanos',                    true),
  ('bi',        '/bi',        'Business Intelligence',               false),
  ('comercial', '/comercial', 'Cotizaciones y listas de precios',    false)
ON CONFLICT (nombre) DO UPDATE SET activo = EXCLUDED.activo;

-- ============================================
-- USUARIOS DE PRUEBA
-- Contraseñas:
--   admin@empresa.com        → Admin123!
--   portal@empresa.com       → Portal123!
--   auditoria@empresa.com    → Auditoria123!
--   rh@empresa.com           → Rh123!
--   empleado@empresa.com     → Empleado123!
--   tickets@empresa.com      → Tickets123!
--   tecnico@empresa.com      → Tecnico123!
-- ============================================
INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, hash_password, activo) VALUES
  ('admin@empresa.com',     'Super',    'Admin',     'local', '$2b$10$j0ocH.ZStdD1LD36spnMZeE/quNQLQr/RhC2M6vrAMQHKh/gLX4qe', true),
  ('portal@empresa.com',    'Portal',   'Admin',     'local', '$2b$10$BN201A2PNES0eL5kF0QgS.zESEv/ppKXN3Vq1..P8pIbb6qhSwUcK', true),
  ('auditoria@empresa.com', 'Auditor',  'Viewer',    'local', '$2b$10$bHYvgo1OthTEdNc4uumpb.Q8C4aZeX.EQyAETuPpDGt91lq7uDhpi', true),
  ('rh@empresa.com',        'RH',       'Admin',     'local', '$2b$10$Yjj76UHHuxhHVVgB/SKdhOwhBKLJ8jk9L.vUcjlNqs63CHrAFdYT.', true),
  ('empleado@empresa.com',  'RH',       'Empleado',  'local', '$2b$10$WOefWZu/ZxUBpITmnLuMyOAKr9NwybUKbG0RpdbgXgt99C0Msg8VS', true),
  ('tickets@empresa.com',   'Tickets',  'Admin',     'local', '$2b$10$h0sGFq7.FAdfiagp4pUQO.cuSwxPp1SimPwIZLPjiqSFffpAKxaSa', true),
  ('tecnico@empresa.com',   'Tickets',  'Tecnico',   'local', '$2b$10$hNqv4lIGXLfn9uvZ.6NjPuZ9IRtZ1xV.bVV09W0gBWJLevPYPY9QO', true)
ON CONFLICT (correo) DO NOTHING;

-- Asignar roles a usuarios
INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u, roles r
WHERE (u.correo = 'admin@empresa.com'     AND r.nombre = 'super_admin')
   OR (u.correo = 'portal@empresa.com'    AND r.nombre = 'portal_admin')
   OR (u.correo = 'auditoria@empresa.com' AND r.nombre = 'auditoria_viewer')
   OR (u.correo = 'rh@empresa.com'        AND r.nombre = 'rh_admin')
   OR (u.correo = 'empleado@empresa.com'  AND r.nombre = 'rh_empleado')
   OR (u.correo = 'tickets@empresa.com'   AND r.nombre = 'tickets_admin')
   OR (u.correo = 'tecnico@empresa.com'   AND r.nombre = 'tickets_tecnico')
ON CONFLICT DO NOTHING;

-- ============================================
-- PERMISOS GRANULARES POR ROL (rol_opcion_permisos)
-- Se ejecuta DESPUÉS de que migración 002 haya creado modulo_opciones
-- ============================================

-- portal_admin: acceso total a módulo portal
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'portal'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'portal_admin'
ON CONFLICT DO NOTHING;

-- auditoria_viewer: solo consulta de logs de auditoría
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, 'consulta'
FROM roles r
JOIN modulos m ON m.nombre = 'auditoria'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
WHERE r.nombre = 'auditoria_viewer'
ON CONFLICT DO NOTHING;

-- rh_admin: acceso total a módulo rh
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'rh_admin'
ON CONFLICT DO NOTHING;

-- rh_empleado: consulta de permisos y recibos; consulta + edición de vacaciones (crea sus propias solicitudes)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
JOIN (VALUES
  ('Permisos',    'consulta'),
  ('Recibos',     'consulta'),
  ('Vacaciones',  'consulta'),
  ('Vacaciones',  'edicion')
) AS t(opcion_nombre, tipo) ON t.opcion_nombre = mo.nombre
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

-- tickets_admin: acceso total a módulo tickets
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'tickets'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'tickets_admin'
ON CONFLICT DO NOTHING;

-- tickets_tecnico: gestión de tickets y adjuntos, consulta de encuestas y categorías
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
