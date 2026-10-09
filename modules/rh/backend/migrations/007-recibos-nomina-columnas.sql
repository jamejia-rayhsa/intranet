-- Alinea recibos_nomina con lo que usa reciboNomina.model.js (idempotente).
-- No elimina nombre_archivo ni fecha_generacion si existen.
ALTER TABLE recibos_nomina ADD COLUMN IF NOT EXISTS fecha_pago DATE;
ALTER TABLE recibos_nomina ADD COLUMN IF NOT EXISTS importe_total DECIMAL(10,2);
ALTER TABLE recibos_nomina ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE recibos_nomina ADD COLUMN IF NOT EXISTS creado_por_id INT REFERENCES usuarios(id);
ALTER TABLE recibos_nomina ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT NOW();
ALTER TABLE recibos_nomina ALTER COLUMN ruta_archivo DROP NOT NULL;
ALTER TABLE recibos_nomina ALTER COLUMN ruta_archivo TYPE VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_recibos_empleado ON recibos_nomina(empleado_id);
CREATE INDEX IF NOT EXISTS idx_recibos_periodo ON recibos_nomina(periodo);
