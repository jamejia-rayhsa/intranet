-- ============================================
-- MIGRACIÓN 001: Tablas del módulo Recursos Humanos
-- ============================================

-- Tabla de empleados
CREATE TABLE IF NOT EXISTS empleados (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  fecha_nacimiento DATE,
  curp VARCHAR(20),
  rfc VARCHAR(20),
  puesto VARCHAR(100),
  departamento VARCHAR(100),
  fecha_ingreso DATE,
  jefe_inmediato_id INT REFERENCES empleados(id),
  estatus VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estatus IN ('activo', 'baja', 'suspendido')),
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

-- Tabla de permisos de ausencia y vacaciones
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

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_empleados_estatus ON empleados(estatus);
CREATE INDEX IF NOT EXISTS idx_empleados_departamento ON empleados(departamento);
CREATE INDEX IF NOT EXISTS idx_empleados_jefe ON empleados(jefe_inmediato_id);
CREATE INDEX IF NOT EXISTS idx_empleados_usuario ON empleados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_expediente_empleado ON expediente_documentos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_permisos_empleado ON permisos_ausencias(empleado_id);
CREATE INDEX IF NOT EXISTS idx_permisos_estatus ON permisos_ausencias(estatus);
CREATE INDEX IF NOT EXISTS idx_recibos_empleado ON recibos_nomina(empleado_id);
CREATE INDEX IF NOT EXISTS idx_recibos_periodo ON recibos_nomina(periodo);
