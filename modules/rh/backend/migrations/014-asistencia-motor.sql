-- Módulo de asistencia (Fase 4): motor de análisis. Parámetros, periodos (quincenas) con cierre, snapshot del turno
-- en asistencia_diaria, ajustes pendientes por marcas posteriores al cierre y bitácora de ejecuciones del motor.
-- Idempotente: se puede re-ejecutar sin efectos secundarios (no toca datos existentes; los parámetros solo se siembran
-- si faltan y nunca se pisa un valor editado por RH).
-- Depende de: init.sql (usuarios, empleados, departamentos, solicitudes_vacaciones, permisos_ausencia),
--   012-asistencia.sql (asistencia_diaria, asistencia_marcas, turnos) y 013 (no se toca).
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).

-- a) Parámetros del módulo (clave/valor). Los valores se guardan como texto y el backend los valida por clave.
CREATE TABLE IF NOT EXISTS asistencia_parametros (
  clave VARCHAR(50) PRIMARY KEY,
  valor TEXT NOT NULL CHECK (btrim(valor) <> ''),
  descripcion TEXT,
  actualizado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asistencia_parametros_actualizado_por ON asistencia_parametros(actualizado_por);

INSERT INTO asistencia_parametros (clave, valor, descripcion) VALUES
  ('analisis_desde', '2026-09-01', 'Primer día que se analiza; lo anterior se guarda pero no se califica'),
  ('cierre_automatico_desde', '2026-10-16', 'Las quincenas que terminan antes de esta fecha solo las cierra RH a mano'),
  ('dias_cierre', '3', 'Días después de terminada la quincena en que el motor la cierra solo (margen para marcas tardías)'),
  ('margen_dia_completo_min', '120', 'Minutos después de la salida programada a partir de los cuales el día se califica'),
  ('version_motor', '1', 'Versión de las reglas de cálculo; se guarda en cada día calculado'),
  ('ventana_seguridad_dias', '7', 'Cada ejecución recalcula además los últimos N días de todos los empleados'),
  ('barrido_completo_horas', '24', 'Cada cuántas horas se recalculan por completo los periodos abiertos')
ON CONFLICT (clave) DO NOTHING;

-- b) Periodos (quincenas 1-15 y 16-fin de mes). Un periodo cerrado no se recalcula: lo cierra el motor
--    (tipo_cierre 'auto') o RH (manual). Solo rh_admin y super_admin reabren, con motivo. Un periodo reabierto no
--    vuelve a cerrarse solo (no_cerrar_automatico): RH lo cierra a mano.
CREATE TABLE IF NOT EXISTS asistencia_periodos (
  id SERIAL PRIMARY KEY,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'abierto',
  cerrado_en TIMESTAMPTZ,
  cerrado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo_cierre VARCHAR(10),
  reabierto_en TIMESTAMPTZ,
  reabierto_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  reabierto_motivo TEXT,
  veces_reabierto INT NOT NULL DEFAULT 0,
  no_cerrar_automatico BOOLEAN NOT NULL DEFAULT false,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asistencia_periodos_inicio_key UNIQUE (fecha_inicio),
  CONSTRAINT asistencia_periodos_rango_check CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT asistencia_periodos_estado_check CHECK (estado IN ('abierto', 'cerrado')),
  CONSTRAINT asistencia_periodos_tipo_cierre_check CHECK (tipo_cierre IS NULL OR tipo_cierre IN ('auto', 'manual')),
  CONSTRAINT asistencia_periodos_cierre_check CHECK (estado = 'abierto' OR (cerrado_en IS NOT NULL AND tipo_cierre IS NOT NULL)),
  CONSTRAINT asistencia_periodos_sin_traslape EXCLUDE USING gist (daterange(fecha_inicio, fecha_fin, '[]') WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_asistencia_periodos_cerrado_por ON asistencia_periodos(cerrado_por);
CREATE INDEX IF NOT EXISTS idx_asistencia_periodos_reabierto_por ON asistencia_periodos(reabierto_por);
CREATE INDEX IF NOT EXISTS idx_asistencia_periodos_estado ON asistencia_periodos(estado, fecha_fin);

-- c) asistencia_diaria: nuevos estatus y SNAPSHOT del turno usado (opción A de la decisión del 2026-10-21: lo ya
--    calculado no cambia si después se edita el turno o se transfiere al empleado). La 012 ya tiene turno_id,
--    primera_marca, ultima_marca, minutos_*, vínculos, version_calculo y calculado_en: no se duplican.
--    'pendiente' = día que aún no termina; 'no_aplica' y 'sin_identificador' los emite el motor pero no se guardan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asistencia_diaria_estatus_check' AND conrelid = 'asistencia_diaria'::regclass
      AND pg_get_constraintdef(oid) LIKE '%pendiente%'
  ) THEN
    ALTER TABLE asistencia_diaria DROP CONSTRAINT IF EXISTS asistencia_diaria_estatus_check;
    ALTER TABLE asistencia_diaria ADD CONSTRAINT asistencia_diaria_estatus_check CHECK (estatus IN (
      'puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'vacaciones',
      'permiso', 'descanso', 'festivo', 'justificada', 'sin_turno',
      'pendiente', 'no_aplica', 'sin_identificador'));
  END IF;
END $$;

ALTER TABLE asistencia_diaria
  ADD COLUMN IF NOT EXISTS periodo_id INT REFERENCES asistencia_periodos(id),
  ADD COLUMN IF NOT EXISTS departamento_id INT REFERENCES departamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen_turno VARCHAR(12) CHECK (origen_turno IS NULL OR origen_turno IN ('departamento', 'empleado')),
  ADD COLUMN IF NOT EXISTS turno_nombre VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entrada_programada TIME,
  ADD COLUMN IF NOT EXISTS salida_programada TIME,
  ADD COLUMN IF NOT EXISTS cruza_medianoche BOOLEAN,
  ADD COLUMN IF NOT EXISTS tolerancia_retardo_min INT,
  ADD COLUMN IF NOT EXISTS tolerancia_salida_min INT,
  ADD COLUMN IF NOT EXISTS umbral_falta_min INT,
  ADD COLUMN IF NOT EXISTS ventana_entrada_antes_min INT,
  ADD COLUMN IF NOT EXISTS ventana_entrada_despues_min INT,
  ADD COLUMN IF NOT EXISTS ventana_salida_antes_min INT,
  ADD COLUMN IF NOT EXISTS ventana_salida_despues_min INT,
  ADD COLUMN IF NOT EXISTS descanso_inicio TIME,
  ADD COLUMN IF NOT EXISTS descanso_min INT,
  ADD COLUMN IF NOT EXISTS marcas_usadas BIGINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detalle JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_periodo ON asistencia_diaria(periodo_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_diaria_departamento ON asistencia_diaria(departamento_id);

-- Defensa en profundidad: un día de un periodo CERRADO no se inserta ni se recalcula (el backend ya lo evita con
-- FOR SHARE sobre el periodo). Se permiten los cambios de las FK de referencia (ON DELETE SET NULL de una
-- solicitud, permiso, festivo o incidencia): no alteran el resultado calculado. Reabrir el periodo los habilita.
CREATE OR REPLACE FUNCTION asistencia_diaria_periodo_abierto() RETURNS trigger AS $$
DECLARE
  estado_periodo TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.periodo_id IS NOT NULL THEN
    SELECT estado INTO estado_periodo FROM asistencia_periodos WHERE id = OLD.periodo_id;
    IF estado_periodo = 'cerrado'
       AND (NEW.empleado_id, NEW.fecha, NEW.periodo_id, NEW.estatus, NEW.minutos_retardo, NEW.minutos_salida_anticipada,
            NEW.primera_marca, NEW.ultima_marca, NEW.turno_id, NEW.version_calculo, NEW.calculado_en)
          IS DISTINCT FROM
          (OLD.empleado_id, OLD.fecha, OLD.periodo_id, OLD.estatus, OLD.minutos_retardo, OLD.minutos_salida_anticipada,
           OLD.primera_marca, OLD.ultima_marca, OLD.turno_id, OLD.version_calculo, OLD.calculado_en) THEN
      RAISE EXCEPTION 'asistencia_diaria: el periodo % está cerrado', OLD.periodo_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.periodo_id IS NOT NULL THEN
    SELECT estado INTO estado_periodo FROM asistencia_periodos WHERE id = NEW.periodo_id;
    IF estado_periodo = 'cerrado' THEN
      RAISE EXCEPTION 'asistencia_diaria: el periodo % está cerrado', NEW.periodo_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asistencia_diaria_periodo_abierto ON asistencia_diaria;
CREATE TRIGGER trg_asistencia_diaria_periodo_abierto
  BEFORE INSERT OR UPDATE ON asistencia_diaria
  FOR EACH ROW EXECUTE FUNCTION asistencia_diaria_periodo_abierto();

-- Índices para lo que lee el motor: marcas nuevas desde la última ejecución y cruces por rango de fechas
CREATE INDEX IF NOT EXISTS idx_asistencia_marcas_importacion ON asistencia_marcas(fecha_importacion);
CREATE INDEX IF NOT EXISTS idx_sol_vac_aprobadas_rango ON solicitudes_vacaciones(empleado_id, fecha_inicial, fecha_final)
  WHERE estatus = 'aprobado';
CREATE INDEX IF NOT EXISTS idx_permisos_aprobados_rango ON permisos_ausencia(empleado_id, fecha_inicio, fecha_fin)
  WHERE estatus = 'aprobado';

-- d) Ajustes pendientes: marcas que llegan (o se vinculan) DESPUÉS del cierre de su periodo. No recalculan nada:
--    RH decide si reabre el periodo (queda constancia de cuándo y quién la resolvió).
CREATE TABLE IF NOT EXISTS asistencia_ajustes_pendientes (
  id SERIAL PRIMARY KEY,
  empleado_id INT NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  periodo_id INT NOT NULL REFERENCES asistencia_periodos(id),
  marca_id BIGINT NOT NULL REFERENCES asistencia_marcas(id),
  motivo VARCHAR(40) NOT NULL,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto_en TIMESTAMPTZ,
  resuelto_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  nota_resolucion TEXT,
  CONSTRAINT asistencia_ajustes_marca_key UNIQUE (marca_id),
  CONSTRAINT asistencia_ajustes_motivo_check CHECK (motivo IN ('marca_posterior_cierre', 'marca_vinculada_posterior_cierre'))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_ajustes_empleado ON asistencia_ajustes_pendientes(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_ajustes_periodo ON asistencia_ajustes_pendientes(periodo_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_ajustes_resuelto_por ON asistencia_ajustes_pendientes(resuelto_por);
CREATE INDEX IF NOT EXISTS idx_asistencia_ajustes_abiertos ON asistencia_ajustes_pendientes(detectado_en) WHERE resuelto_en IS NULL;

-- e) Bitácora de ejecuciones del motor (sin datos personales: solo conteos y estados)
CREATE TABLE IF NOT EXISTS asistencia_ejecuciones (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(15) NOT NULL,
  origen VARCHAR(15) NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'en_curso',
  inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin TIMESTAMPTZ,
  desde DATE,
  hasta DATE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  empleados_evaluados INT NOT NULL DEFAULT 0,
  dias_evaluados INT NOT NULL DEFAULT 0,
  dias_modificados INT NOT NULL DEFAULT 0,
  marcas_vinculadas INT NOT NULL DEFAULT 0,
  periodos_cerrados INT NOT NULL DEFAULT 0,
  ajustes_nuevos INT NOT NULL DEFAULT 0,
  error TEXT,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT asistencia_ejecuciones_tipo_check CHECK (tipo IN ('incremental', 'completa', 'manual', 'cierre', 'reapertura')),
  CONSTRAINT asistencia_ejecuciones_origen_check CHECK (origen IN ('planificador', 'api', 'cli')),
  CONSTRAINT asistencia_ejecuciones_estado_check CHECK (estado IN ('en_curso', 'ok', 'parcial', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_ejecuciones_inicio ON asistencia_ejecuciones(inicio DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_ejecuciones_estado ON asistencia_ejecuciones(estado, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_ejecuciones_usuario ON asistencia_ejecuciones(usuario_id);

-- f) RLS deny-all (decisión 2026-10-08) en la propia migración, igual que la 012 y la 013
ALTER TABLE asistencia_parametros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_periodos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_ajustes_pendientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_ejecuciones         ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON asistencia_parametros, asistencia_periodos, asistencia_ajustes_pendientes, asistencia_ejecuciones
      FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE asistencia_periodos_id_seq, asistencia_ajustes_pendientes_id_seq, asistencia_ejecuciones_id_seq
      FROM anon, authenticated;
    REVOKE ALL ON FUNCTION asistencia_diaria_periodo_abierto() FROM anon, authenticated;
  END IF;
END $$;
