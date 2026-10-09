-- El rol rh_empleado necesita Expedientes:consulta para ver SU propio expediente
-- (el middleware acceso-empleado limita la vista a su empleado). Idempotente;
-- no falla si el rol o la opcion no existen. No concede edicion.
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, 'consulta'
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Expedientes'
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;
