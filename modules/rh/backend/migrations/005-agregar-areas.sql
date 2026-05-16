-- ============================================
-- MIGRACIÓN 005: Tabla areas + FK en departamentos
-- ============================================

CREATE TABLE IF NOT EXISTS areas (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL UNIQUE,
  descripcion     TEXT,
  activo          BOOLEAN DEFAULT true,
  fecha_creacion  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE departamentos
  ADD COLUMN IF NOT EXISTS area_id INT REFERENCES areas(id);

CREATE INDEX IF NOT EXISTS idx_departamentos_area ON departamentos(area_id);
