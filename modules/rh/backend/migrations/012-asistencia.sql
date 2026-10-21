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

-- c) Marcas crudas y sincronización. Solo las toca el backend (la ingesta por API con llave es la
--    Fase 3; no hay rol de BD para la interfaz). La marca original no se modifica ni se borra nunca.
CREATE TABLE IF NOT EXISTS asistencia_sync_lotes (
  id BIGSERIAL PRIMARY KEY,
  origen VARCHAR(50) NOT NULL,
  lote_externo VARCHAR(100),
  ip VARCHAR(45),
  recibidas INT NOT NULL DEFAULT 0,
  insertadas INT NOT NULL DEFAULT 0,
  duplicadas INT NOT NULL DEFAULT 0,
  rechazadas INT NOT NULL DEFAULT 0,
  hash_cuerpo CHAR(64),
  fecha_recepcion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asistencia_sync_lotes_externo
  ON asistencia_sync_lotes(origen, lote_externo) WHERE lote_externo IS NOT NULL;

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
  CONSTRAINT asistencia_incidencias_tipo_check CHECK (tipo IN ('justificacion', 'correccion_marca', 'otro'))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_incidencias_empleado_fecha ON asistencia_incidencias(empleado_id, fecha);

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
