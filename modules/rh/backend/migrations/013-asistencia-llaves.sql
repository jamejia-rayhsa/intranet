-- Módulo de asistencia (Fase 3): llaves de la ingesta de marcas (X-Api-Key), auditoría acotada de rechazos,
-- vínculo lote -> llave, permiso de administración y RLS.
-- Idempotente: se puede re-ejecutar sin efectos secundarios (no toca datos existentes).
-- Depende de: init.sql (usuarios, modulo_opciones, rol_opcion_permisos) y de 012-asistencia.sql
--   (asistencia_sync_lotes).
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
--
-- La llave son 32 bytes aleatorios (formato rhk_<8 hex>_<43 base64url>). En BD NUNCA se guarda en claro:
-- solo su SHA-256 (hash_llave) y el prefijo visible (rhk_ + 8 hex). Con 256 bits de entropía un hash rápido
-- es suficiente (no hay diccionario que probar; bcrypt/scrypt solo encarecerían cada petición) y la
-- comparación se hace en tiempo constante en el backend.

-- a) Llaves de ingesta. Una llave sirve para un solo origen y solo para las dos rutas de ingesta.
--    Vigencia [vigente_desde, vigente_hasta): vigente_hasta NULL = sin vencimiento; al rotar se le fija a la
--    llave anterior para que ambas valgan durante el solape. ips_permitidas vacía = sin restricción de IP.
CREATE TABLE IF NOT EXISTS asistencia_llaves (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  origen VARCHAR(50) NOT NULL DEFAULT 'biotime' CHECK (btrim(origen) <> ''),
  prefijo VARCHAR(16) NOT NULL,
  hash_llave CHAR(64) NOT NULL CHECK (hash_llave ~ '^[0-9a-f]{64}$'),
  estado VARCHAR(20) NOT NULL DEFAULT 'activa',
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_hasta TIMESTAMPTZ,
  ips_permitidas TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(ips_permitidas) <= 20),
  ultimo_uso TIMESTAMPTZ,
  ultima_ip VARCHAR(45),
  reemplaza_a INT REFERENCES asistencia_llaves(id) ON DELETE SET NULL,
  creado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revocada_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_revocacion TIMESTAMPTZ,
  CONSTRAINT asistencia_llaves_prefijo_key UNIQUE (prefijo),
  CONSTRAINT asistencia_llaves_hash_key UNIQUE (hash_llave),
  CONSTRAINT asistencia_llaves_estado_check CHECK (estado IN ('activa', 'revocada')),
  CONSTRAINT asistencia_llaves_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT asistencia_llaves_revocacion_check CHECK ((estado = 'revocada') = (fecha_revocacion IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_llaves_creado_por ON asistencia_llaves(creado_por);
CREATE INDEX IF NOT EXISTS idx_asistencia_llaves_revocada_por ON asistencia_llaves(revocada_por);
CREATE INDEX IF NOT EXISTS idx_asistencia_llaves_reemplaza_a ON asistencia_llaves(reemplaza_a);

-- b) Cada lote recibido queda ligado a la llave que lo envió.
ALTER TABLE asistencia_sync_lotes
  ADD COLUMN IF NOT EXISTS llave_id INT REFERENCES asistencia_llaves(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_asistencia_sync_lotes_llave ON asistencia_sync_lotes(llave_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_sync_lotes_recepcion ON asistencia_sync_lotes(fecha_recepcion);

-- c) Auditoría ACOTADA de accesos rechazados a la ingesta. Una fila por (hora, IP, motivo) con un contador:
--    un ataque o una llave mal configurada no llena la tabla (el backend además limita las filas nuevas por
--    hora y borra las de más de 30 días). No guarda la llave recibida: solo el prefijo si tenía el formato.
--    No se usa la tabla `auditoria` porque su usuario_id es NOT NULL y la ingesta no tiene usuario.
CREATE TABLE IF NOT EXISTS asistencia_llaves_rechazos (
  id BIGSERIAL PRIMARY KEY,
  hora TIMESTAMPTZ NOT NULL,
  ip VARCHAR(45) NOT NULL,
  motivo VARCHAR(30) NOT NULL,
  prefijo VARCHAR(16),
  llave_id INT REFERENCES asistencia_llaves(id) ON DELETE SET NULL,
  intentos INT NOT NULL DEFAULT 1 CHECK (intentos >= 1),
  primera TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asistencia_llaves_rechazos_clave_key UNIQUE (hora, ip, motivo),
  CONSTRAINT asistencia_llaves_rechazos_motivo_check CHECK (motivo IN (
    'sin_llave', 'llave_malformada', 'llave_desconocida', 'llave_incorrecta',
    'llave_revocada', 'llave_fuera_de_vigencia', 'ip_no_permitida'))
);
CREATE INDEX IF NOT EXISTS idx_asistencia_llaves_rechazos_llave ON asistencia_llaves_rechazos(llave_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_llaves_rechazos_ultima ON asistencia_llaves_rechazos(ultima);

-- d) RLS deny-all en las tablas nuevas (igual que 012: en la propia migración).
ALTER TABLE asistencia_llaves           ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_llaves_rechazos  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON asistencia_llaves, asistencia_llaves_rechazos FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE asistencia_llaves_id_seq, asistencia_llaves_rechazos_id_seq FROM anon, authenticated;
  END IF;
END $$;

-- e) Permiso nuevo `Ingesta` (administrar llaves, ver lotes, revincular marcas): solo rh_admin y super_admin
--    (NO portal_admin). Los tipos reales de rol_opcion_permisos son solo 'consulta' y 'edicion'.
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, 'Ingesta', 'Llaves de la ingesta de marcas de asistencia y estado de la sincronización', 11
FROM modulos m
WHERE m.nombre = 'rh'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'rh'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Ingesta'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('rh_admin', 'super_admin')
ON CONFLICT DO NOTHING;
