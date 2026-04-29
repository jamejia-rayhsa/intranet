-- Registra la opción 'Vacaciones' en el módulo rh y asigna permisos a los roles correspondientes.
-- Depende de: 002-modelo-permisos-granular.sql (tablas modulo_opciones y rol_opcion_permisos)

INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, 'Vacaciones', 'Solicitudes de vacaciones y control de saldo', 5
FROM modulos m
WHERE m.nombre = 'rh'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- rh_admin: consulta + edición de vacaciones
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Vacaciones'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'rh_admin'
ON CONFLICT DO NOTHING;

-- rh_empleado: consulta + edición (puede consultar su saldo y crear solicitudes)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Vacaciones'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;
