CREATE TABLE IF NOT EXISTS tabla_calculo_vacaciones (
  anios_inicio INT PRIMARY KEY,
  anios_fin INT NOT NULL,
  dias_vacaciones INT NOT NULL
);

INSERT INTO tabla_calculo_vacaciones (anios_inicio, anios_fin, dias_vacaciones) VALUES
(1,1,12),(2,2,14),(3,3,16),(4,4,18),(5,5,20),
(6,10,22),(11,15,24),(16,20,26),(21,25,28),(26,30,30),
(31,35,32),(36,40,34),(41,45,36),(46,50,38),(51,55,40),(56,60,42)
ON CONFLICT (anios_inicio) DO NOTHING;

CREATE TABLE IF NOT EXISTS solicitudes_vacaciones (
  id SERIAL PRIMARY KEY,
  fecha_solicitud TIMESTAMP DEFAULT NOW(),
  empleado_id INT REFERENCES empleados(id),
  numero_nomina VARCHAR(50),
  nombre VARCHAR(200),
  apellido_paterno VARCHAR(100),
  apellido_materno VARCHAR(100),
  fecha_imss DATE,
  antiguedad INT,
  ubicacion VARCHAR(100),
  departamento VARCHAR(100),
  jefe_inmediato_id INT,
  jefe_nombre VARCHAR(200),
  fecha_inicial DATE NOT NULL,
  fecha_final DATE NOT NULL,
  fecha_regreso DATE,
  periodo INT NOT NULL,
  dias_periodo INT NOT NULL,
  dias_disfrutados INT NOT NULL DEFAULT 0,
  dias_pendientes_inicial INT NOT NULL,
  dias_a_disfrutar INT NOT NULL,
  dias_pendientes_final INT NOT NULL,
  observaciones TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estatus IN ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo TEXT,
  autoriza_id INT REFERENCES usuarios(id),
  autoriza_nombre VARCHAR(200),
  fecha_autoriza TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_vac_empleado ON solicitudes_vacaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_sol_vac_estatus ON solicitudes_vacaciones(estatus);
CREATE INDEX IF NOT EXISTS idx_sol_vac_periodo ON solicitudes_vacaciones(periodo);
CREATE INDEX IF NOT EXISTS idx_sol_vac_jefe ON solicitudes_vacaciones(jefe_inmediato_id);
