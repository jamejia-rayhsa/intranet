-- ============================================
-- MIGRACIÓN 001: Tablas del módulo Recursos Humanos
-- ============================================

-- Tablas catálogo (deben crearse antes que empleados por las FK)

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

-- Tabla principal de empleados
CREATE TABLE IF NOT EXISTS empleados (
  id SERIAL PRIMARY KEY,
  usuario_id INT UNIQUE REFERENCES usuarios(id),

  -- Datos personales
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  fecha_nacimiento DATE,
  curp VARCHAR(20),
  rfc VARCHAR(20),
  nss VARCHAR(20),
  genero VARCHAR(20),
  estado_civil VARCHAR(30),
  escolaridad VARCHAR(50),
  estado_nacimiento VARCHAR(100),

  -- Contacto
  celular_personal VARCHAR(20),
  correo_personal VARCHAR(255),
  telefono_emergencia VARCHAR(20),
  parentesco_emergencia VARCHAR(50),
  contacto_emergencia VARCHAR(100),

  -- Domicilio
  calle VARCHAR(200),
  colonia VARCHAR(100),
  codigo_postal VARCHAR(10),
  municipio VARCHAR(100),
  estado_residencia VARCHAR(100),

  -- Datos laborales
  numero_nomina VARCHAR(50),
  fecha_imss DATE,
  fecha_ingreso DATE,
  fecha_renovacion DATE,
  tipo_contrato VARCHAR(50),
  celular_corporativo VARCHAR(20),
  puesto_id INT REFERENCES puestos(id),
  departamento_id INT REFERENCES departamentos(id),
  ubicacion_id INT REFERENCES ubicaciones(id),
  jefe_inmediato_id INT REFERENCES empleados(id),

  -- Datos financieros
  banco VARCHAR(100),
  clabe VARCHAR(20),
  cp_fiscal VARCHAR(10),
  infonavit VARCHAR(50),
  fonacot VARCHAR(50),

  -- Control
  estatus VARCHAR(20) NOT NULL DEFAULT 'activo'
    CHECK (estatus IN ('activo', 'baja', 'suspendido')),
  fecha_baja DATE,
  motivo_baja TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Tabla de documentos del expediente
CREATE TABLE IF NOT EXISTS expediente_documentos (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(50) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  fecha_carga TIMESTAMP DEFAULT NOW(),
  descripcion TEXT
);

-- Tabla de permisos de ausencia
CREATE TABLE IF NOT EXISTS permisos_ausencias (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('vacaciones', 'incapacidad', 'asunto_personal', 'otro')),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  motivo TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'aprobado', 'rechazado')),
  aprobado_por_id INT REFERENCES empleados(id),
  fecha_aprobacion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Tabla de recibos de nómina
CREATE TABLE IF NOT EXISTS recibos_nomina (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  periodo VARCHAR(20) NOT NULL,
  fecha_pago DATE,
  importe_total DECIMAL(10,2),
  ruta_archivo VARCHAR(500),
  descripcion TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  creado_por_id INT REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_empleados_estatus ON empleados(estatus);
CREATE INDEX IF NOT EXISTS idx_empleados_departamento ON empleados(departamento_id);
CREATE INDEX IF NOT EXISTS idx_empleados_puesto ON empleados(puesto_id);
CREATE INDEX IF NOT EXISTS idx_empleados_ubicacion ON empleados(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_empleados_jefe ON empleados(jefe_inmediato_id);
CREATE INDEX IF NOT EXISTS idx_empleados_usuario ON empleados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_empleados_nomina ON empleados(numero_nomina);
CREATE INDEX IF NOT EXISTS idx_expediente_empleado ON expediente_documentos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_permisos_empleado ON permisos_ausencias(empleado_id);
CREATE INDEX IF NOT EXISTS idx_permisos_estatus ON permisos_ausencias(estatus);
CREATE INDEX IF NOT EXISTS idx_recibos_empleado ON recibos_nomina(empleado_id);
CREATE INDEX IF NOT EXISTS idx_recibos_periodo ON recibos_nomina(periodo);
