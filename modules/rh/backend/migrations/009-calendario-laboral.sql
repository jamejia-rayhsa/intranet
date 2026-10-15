-- Calendario laboral y cupo de vacaciones por departamento (Fase 2).
-- Idempotente: se puede re-ejecutar sin efectos secundarios.
-- Depende de: init.sql (usuarios, empleados, departamentos, solicitudes_vacaciones, modulo_opciones, rol_opcion_permisos).
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).

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
