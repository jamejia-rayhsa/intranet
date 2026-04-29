-- ============================================
-- MIGRACIÓN 004: Corrección de tabla empleados
-- Aplica SOLO si la migración 001 ya fue ejecutada con el esquema antiguo.
-- Para instalaciones nuevas, 001-crear-tablas-rh.sql ya es correcto.
-- ============================================

-- 1. Crear tablas catálogo si no existen
CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS ubicaciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion TEXT,
  ciudad VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal VARCHAR(10),
  telefono VARCHAR(20),
  activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS puestos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  departamento_id INT REFERENCES departamentos(id),
  nivel_salarial VARCHAR(50),
  activo BOOLEAN DEFAULT true
);

-- 2. Renombrar columna apellido → apellido_paterno (si aún existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empleados' AND column_name = 'apellido'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empleados' AND column_name = 'apellido_paterno'
  ) THEN
    ALTER TABLE empleados RENAME COLUMN apellido TO apellido_paterno;
  END IF;
END $$;

-- 3. Agregar columnas que el modelo espera y no existen en el esquema viejo
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS apellido_materno VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nss VARCHAR(20),
  ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30),
  ADD COLUMN IF NOT EXISTS escolaridad VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estado_nacimiento VARCHAR(100),
  ADD COLUMN IF NOT EXISTS celular_personal VARCHAR(20),
  ADD COLUMN IF NOT EXISTS correo_personal VARCHAR(255),
  ADD COLUMN IF NOT EXISTS telefono_emergencia VARCHAR(20),
  ADD COLUMN IF NOT EXISTS parentesco_emergencia VARCHAR(50),
  ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(100),
  ADD COLUMN IF NOT EXISTS calle VARCHAR(200),
  ADD COLUMN IF NOT EXISTS colonia VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(10),
  ADD COLUMN IF NOT EXISTS municipio VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado_residencia VARCHAR(100),
  ADD COLUMN IF NOT EXISTS numero_nomina VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_imss DATE,
  ADD COLUMN IF NOT EXISTS fecha_renovacion DATE,
  ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(50),
  ADD COLUMN IF NOT EXISTS celular_corporativo VARCHAR(20),
  ADD COLUMN IF NOT EXISTS puesto_id INT REFERENCES puestos(id),
  ADD COLUMN IF NOT EXISTS departamento_id INT REFERENCES departamentos(id),
  ADD COLUMN IF NOT EXISTS ubicacion_id INT REFERENCES ubicaciones(id),
  ADD COLUMN IF NOT EXISTS banco VARCHAR(100),
  ADD COLUMN IF NOT EXISTS clabe VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cp_fiscal VARCHAR(10),
  ADD COLUMN IF NOT EXISTS infonavit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fonacot VARCHAR(50);

-- 4. Agregar UNIQUE en usuario_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'empleados'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%usuario_id%'
  ) THEN
    ALTER TABLE empleados ADD CONSTRAINT empleados_usuario_id_unique UNIQUE (usuario_id);
  END IF;
END $$;

-- 5. Índices para columnas nuevas
CREATE INDEX IF NOT EXISTS idx_empleados_departamento ON empleados(departamento_id);
CREATE INDEX IF NOT EXISTS idx_empleados_puesto ON empleados(puesto_id);
CREATE INDEX IF NOT EXISTS idx_empleados_ubicacion ON empleados(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_empleados_nomina ON empleados(numero_nomina);
