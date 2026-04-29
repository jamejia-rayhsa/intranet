-- ============================================
-- SEED 002: Empleados de ejemplo con expediente completo + vacaciones
-- Idempotente: re-ejecutable sin duplicar datos.
-- Contraseñas:
--   rh@empresa.com        → Rh123!
--   empleado@empresa.com  → Empleado123!
-- ============================================

-- ============================================
-- 1. CATÁLOGOS
-- ============================================

INSERT INTO departamentos (nombre, descripcion, activo) VALUES
  ('Recursos Humanos',    'Gestión del talento humano',                      true),
  ('Crédito y Cobranza',  'Gestión de créditos y recuperación de cartera',   true)
ON CONFLICT (nombre) DO NOTHING;

-- ubicaciones: sin UNIQUE en nombre
INSERT INTO ubicaciones (nombre, direccion, ciudad, estado, codigo_postal, telefono, activo)
SELECT 'Ciudad de México', 'Av. Insurgentes Sur 1234, Piso 5', 'Ciudad de México', 'Ciudad de México', '06600', '5555551234', true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE nombre = 'Ciudad de México');

-- puestos: sin UNIQUE en nombre
INSERT INTO puestos (nombre, descripcion, departamento_id, nivel_salarial, activo)
SELECT 'Coordinador RH', 'Coordinación del área de Recursos Humanos', d.id, 'N3', true
FROM departamentos d WHERE d.nombre = 'Recursos Humanos'
  AND NOT EXISTS (SELECT 1 FROM puestos WHERE nombre = 'Coordinador RH');

INSERT INTO puestos (nombre, descripcion, departamento_id, nivel_salarial, activo)
SELECT 'Analista de Crédito', 'Análisis y gestión de cartera crediticia', d.id, 'N2', true
FROM departamentos d WHERE d.nombre = 'Crédito y Cobranza'
  AND NOT EXISTS (SELECT 1 FROM puestos WHERE nombre = 'Analista de Crédito');

-- ============================================
-- 2. USUARIOS DE ACCESO (idempotente)
-- Contraseñas ya hasheadas con bcrypt cost=10
-- ============================================

-- rh@empresa.com → Rh123!
INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, hash_password, activo)
VALUES ('rh@empresa.com', 'Carlos', 'Ramírez', 'local',
        '$2b$10$Yjj76UHHuxhHVVgB/SKdhOwhBKLJ8jk9L.vUcjlNqs63CHrAFdYT.', true)
ON CONFLICT (correo) DO NOTHING;

-- empleado@empresa.com → Empleado123!
INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, hash_password, activo)
VALUES ('empleado@empresa.com', 'María', 'González', 'local',
        '$2b$10$WOefWZu/ZxUBpITmnLuMyOAKr9NwybUKbG0RpdbgXgt99C0Msg8VS', true)
ON CONFLICT (correo) DO NOTHING;

-- ============================================
-- 3. ASIGNACIÓN DE ROLES
-- El sistema lee usuario_rol para determinar rol_nombre en el JWT.
-- ============================================

-- rh@empresa.com → rh_admin
INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u, roles r
WHERE u.correo = 'rh@empresa.com' AND r.nombre = 'rh_admin'
ON CONFLICT DO NOTHING;

-- empleado@empresa.com → rh_empleado
INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u, roles r
WHERE u.correo = 'empleado@empresa.com' AND r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

-- Sincronizar usuarios.rol_id (usado por verificarPermiso vía req.user.rol_id)
UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = 'rh_admin')
WHERE correo = 'rh@empresa.com';

UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = 'rh_empleado')
WHERE correo = 'empleado@empresa.com';

-- ============================================
-- 4. EMPLEADO JEFE — Carlos Ramírez Torres (rh@empresa.com)
-- Ingreso: 2023-02-01 | Nómina: 001
-- ============================================

INSERT INTO empleados (
  usuario_id,
  -- Datos personales
  nombre, apellido_paterno, apellido_materno,
  fecha_nacimiento, curp, rfc, nss,
  genero, estado_civil, escolaridad, estado_nacimiento,
  -- Contacto
  celular_personal, correo_personal,
  telefono_emergencia, parentesco_emergencia, contacto_emergencia,
  -- Domicilio
  calle, colonia, codigo_postal, municipio, estado_residencia,
  -- Datos laborales
  numero_nomina, fecha_imss, fecha_ingreso, fecha_renovacion, tipo_contrato,
  celular_corporativo, puesto_id, departamento_id, ubicacion_id,
  -- Datos financieros
  banco, clabe, cp_fiscal, infonavit, fonacot,
  -- Control
  estatus
)
SELECT
  u.id,
  'Carlos', 'Ramírez', 'Torres',
  '1985-06-15', 'RATC850615HDFMRR09', 'RATC850615AB1', '98765432101',
  'Masculino', 'Casado', 'Licenciatura', 'Ciudad de México',
  '5512345678', 'carlos.ramirez@personal.mx',
  '5598765432', 'Esposa', 'Laura Torres Méndez',
  'Av. Insurgentes Sur 2340 Int. 5', 'Del Valle', '03100', 'Benito Juárez', 'Ciudad de México',
  '001', '2023-02-01'::date, '2023-02-01'::date, '2024-02-01'::date, 'Indeterminado',
  '5500112233', p.id, d.id, ub.id,
  'BANAMEX', '002180500000000001', '03100', NULL, NULL,
  'activo'
FROM usuarios u, puestos p, departamentos d, ubicaciones ub
WHERE u.correo = 'rh@empresa.com'
  AND p.nombre = 'Coordinador RH'
  AND d.nombre = 'Recursos Humanos'
  AND ub.nombre = 'Ciudad de México'
  AND NOT EXISTS (SELECT 1 FROM empleados WHERE usuario_id = u.id);

-- ============================================
-- 5. EMPLEADO SUBORDINADO — María González López (empleado@empresa.com)
-- Ingreso: 2022-03-15 | Nómina: 096 | Jefe: Carlos Ramírez
-- ============================================

INSERT INTO empleados (
  usuario_id,
  -- Datos personales
  nombre, apellido_paterno, apellido_materno,
  fecha_nacimiento, curp, rfc, nss,
  genero, estado_civil, escolaridad, estado_nacimiento,
  -- Contacto
  celular_personal, correo_personal,
  telefono_emergencia, parentesco_emergencia, contacto_emergencia,
  -- Domicilio
  calle, colonia, codigo_postal, municipio, estado_residencia,
  -- Datos laborales
  numero_nomina, fecha_imss, fecha_ingreso, fecha_renovacion, tipo_contrato,
  celular_corporativo, puesto_id, departamento_id, ubicacion_id, jefe_inmediato_id,
  -- Datos financieros
  banco, clabe, cp_fiscal, infonavit, fonacot,
  -- Control
  estatus
)
SELECT
  u.id,
  'María', 'González', 'López',
  '1995-03-26', 'GOLM950326MDFNZP08', 'GOLM950326HG1', '12345678901',
  'Femenino', 'Soltera', 'Licenciatura', 'Jalisco',
  '5587654321', 'maria.gonzalez@personal.mx',
  '5534567890', 'Madre', 'Rosa López Hernández',
  'Calle Nápoles 456 Int. 3', 'Nápoles', '03810', 'Benito Juárez', 'Ciudad de México',
  '096', '2022-03-15'::date, '2022-03-15'::date, '2023-03-15'::date, 'Indeterminado',
  '5511223344', p.id, d.id, ub.id,
  (SELECT e2.id FROM empleados e2
   JOIN usuarios u2 ON e2.usuario_id = u2.id
   WHERE u2.correo = 'rh@empresa.com'),
  'BBVA', '012180500000000096', '03810', '5544332211', NULL,
  'activo'
FROM usuarios u, puestos p, departamentos d, ubicaciones ub
WHERE u.correo = 'empleado@empresa.com'
  AND p.nombre = 'Analista de Crédito'
  AND d.nombre = 'Crédito y Cobranza'
  AND ub.nombre = 'Ciudad de México'
  AND NOT EXISTS (SELECT 1 FROM empleados WHERE usuario_id = u.id);

-- ============================================
-- 6. PERMISOS GRANULARES para rh_empleado (si no existen)
-- Necesario para que verificarPermiso funcione con el rol rh_empleado.
-- ============================================

INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
JOIN (VALUES
  ('Permisos',   'consulta'),
  ('Recibos',    'consulta'),
  ('Vacaciones', 'consulta'),
  ('Vacaciones', 'edicion')
) AS t(opcion_nombre, tipo) ON t.opcion_nombre = mo.nombre
WHERE r.nombre = 'rh_empleado'
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. SOLICITUDES DE VACACIONES DE EJEMPLO
-- ============================================
-- Empleado María González López — Nómina 096
-- 2024: antigüedad 2 años → 14 días (LFT) — PERIODO COMPLETO
-- 2025: antigüedad 3 años → 16 días — 10 aprobados + 5 pendientes (1 día libre)
-- 2026: antigüedad 4 años → 18 días — 5 pendientes (13 días libres)

-- 2024 · solicitud 1/2 (aprobada, 7 días, ene 2024)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 2, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2024-01-08'::date, '2024-01-14'::date, '2024-01-15'::date, 2024,
  14, 0, 14, 7, 7,
  'Vacaciones de año nuevo', 'aprobado', 'Carlos Ramírez Torres',
  '2023-12-20'::timestamp, '2023-12-15'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2024 AND sv.fecha_inicial = '2024-01-08'::date
  );

-- 2024 · solicitud 2/2 (aprobada, 7 días, jul 2024)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 2, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2024-07-15'::date, '2024-07-21'::date, '2024-07-22'::date, 2024,
  14, 7, 7, 7, 0,
  'Vacaciones de verano 2024', 'aprobado', 'Carlos Ramírez Torres',
  '2024-06-28'::timestamp, '2024-06-20'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2024 AND sv.fecha_inicial = '2024-07-15'::date
  );

-- 2025 · solicitud 1/3 (aprobada, 5 días, ene 2025)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 3, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2025-01-06'::date, '2025-01-10'::date, '2025-01-13'::date, 2025,
  16, 0, 16, 5, 11,
  'Descanso de año nuevo 2025', 'aprobado', 'Carlos Ramírez Torres',
  '2024-12-20'::timestamp, '2024-12-15'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2025 AND sv.fecha_inicial = '2025-01-06'::date
  );

-- 2025 · solicitud 2/3 (aprobada, 5 días, abr 2025)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 3, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2025-04-14'::date, '2025-04-18'::date, '2025-04-22'::date, 2025,
  16, 5, 11, 5, 6,
  'Semana Santa 2025', 'aprobado', 'Carlos Ramírez Torres',
  '2025-03-28'::timestamp, '2025-03-20'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2025 AND sv.fecha_inicial = '2025-04-14'::date
  );

-- 2025 · solicitud 3/3 (PENDIENTE, 5 días, ago 2025)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 3, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2025-08-11'::date, '2025-08-15'::date, '2025-08-18'::date, 2025,
  16, 10, 6, 5, 1,
  'Vacaciones de verano 2025', 'pendiente',
  '2025-07-15'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2025 AND sv.fecha_inicial = '2025-08-11'::date
  );

-- 2026 · solicitud 1/1 (PENDIENTE, 5 días, ene 2026)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, fecha_solicitud
)
SELECT e.id, '096', 'María', 'González', 'López',
  '2022-03-15'::date, 4, 'Ciudad de México', 'Crédito y Cobranza',
  jefe.id, 'Carlos Ramírez Torres',
  '2026-01-05'::date, '2026-01-09'::date, '2026-01-12'::date, 2026,
  18, 0, 18, 5, 13,
  'Descanso de año nuevo 2026', 'pendiente',
  '2025-12-15'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
WHERE u.correo = 'empleado@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2026 AND sv.fecha_inicial = '2026-01-05'::date
  );

-- ============================================
-- Carlos Ramírez Torres (rh@empresa.com) — vacaciones de referencia
-- 2024: 1 año → 12 días — PERIODO COMPLETO
-- 2025: 2 años → 14 días — 7 aprobados (7 libres)
-- ============================================

-- 2024 · solicitud 1/2 (aprobada, 6 días, mar 2024)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '001', 'Carlos', 'Ramírez', 'Torres',
  '2023-02-01'::date, 1, 'Ciudad de México', 'Recursos Humanos',
  NULL, NULL,
  '2024-03-11'::date, '2024-03-16'::date, '2024-03-18'::date, 2024,
  12, 0, 12, 6, 6,
  'Vacaciones primer semestre 2024', 'aprobado', 'Super Admin',
  '2024-02-28'::timestamp, '2024-02-20'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
WHERE u.correo = 'rh@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2024 AND sv.fecha_inicial = '2024-03-11'::date
  );

-- 2024 · solicitud 2/2 (aprobada, 6 días, oct 2024)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '001', 'Carlos', 'Ramírez', 'Torres',
  '2023-02-01'::date, 1, 'Ciudad de México', 'Recursos Humanos',
  NULL, NULL,
  '2024-10-14'::date, '2024-10-19'::date, '2024-10-21'::date, 2024,
  12, 6, 6, 6, 0,
  'Vacaciones segundo semestre 2024', 'aprobado', 'Super Admin',
  '2024-09-30'::timestamp, '2024-09-20'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
WHERE u.correo = 'rh@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2024 AND sv.fecha_inicial = '2024-10-14'::date
  );

-- 2025 · solicitud 1/1 (aprobada, 7 días, feb 2025)
INSERT INTO solicitudes_vacaciones (
  empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
  fecha_imss, antiguedad, ubicacion, departamento, jefe_inmediato_id, jefe_nombre,
  fecha_inicial, fecha_final, fecha_regreso, periodo,
  dias_periodo, dias_disfrutados, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final,
  observaciones, estatus, autoriza_nombre, fecha_autoriza, fecha_solicitud
)
SELECT e.id, '001', 'Carlos', 'Ramírez', 'Torres',
  '2023-02-01'::date, 2, 'Ciudad de México', 'Recursos Humanos',
  NULL, NULL,
  '2025-02-03'::date, '2025-02-09'::date, '2025-02-10'::date, 2025,
  14, 0, 14, 7, 7,
  'Vacaciones primer trimestre 2025', 'aprobado', 'Super Admin',
  '2025-01-20'::timestamp, '2025-01-15'::timestamp
FROM empleados e JOIN usuarios u ON e.usuario_id = u.id
WHERE u.correo = 'rh@empresa.com'
  AND NOT EXISTS (
    SELECT 1 FROM solicitudes_vacaciones sv
    WHERE sv.empleado_id = e.id AND sv.periodo = 2025 AND sv.fecha_inicial = '2025-02-03'::date
  );
