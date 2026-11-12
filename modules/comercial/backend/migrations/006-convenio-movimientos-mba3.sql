-- Consumo automático de Convenios desde MBA3.
--
-- Decisiones del humano (2026-11-10):
-- 1. Cantidad de consumo = FACTURADOS del renglón de pedido (no CANT_PEDIDO).
-- 2. Las devoluciones (notas de crédito de ventas, concepto DEVV) se RESTAN del consumo: nuevo tipo
--    de movimiento 'devolucion'.
-- 3. Frecuencia: una vez al día (el planificador vive en el backend; aquí solo el modelo de datos).
--
-- Los movimientos automáticos los escribe el proceso de sincronización, no una persona:
--  - origen distingue lo capturado a mano ('manual') de lo traído de MBA3 ('mba3');
--  - referencia_externa identifica el renglón de origen (p. ej. "PED:246814:1" o "NC:1006352:R-144-07-00014")
--    y, junto con la línea, es única: volver a correr la sincronización actualiza, nunca duplica;
--  - registrado_por_id pasa a ser opcional SOLO para origen 'mba3'.

ALTER TABLE comercial_convenio_movimientos
  DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_tipo_check;
ALTER TABLE comercial_convenio_movimientos
  ADD CONSTRAINT comercial_convenio_movimientos_tipo_check
  CHECK (tipo IN ('compra_inicial', 'consumo', 'devolucion'));

ALTER TABLE comercial_convenio_movimientos
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE comercial_convenio_movimientos
  ADD COLUMN IF NOT EXISTS referencia_externa TEXT;

ALTER TABLE comercial_convenio_movimientos
  DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_origen_check;
ALTER TABLE comercial_convenio_movimientos
  ADD CONSTRAINT comercial_convenio_movimientos_origen_check
  CHECK (origen IN ('manual', 'mba3'));

ALTER TABLE comercial_convenio_movimientos ALTER COLUMN registrado_por_id DROP NOT NULL;
ALTER TABLE comercial_convenio_movimientos
  DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_registrado_chk;
ALTER TABLE comercial_convenio_movimientos
  ADD CONSTRAINT comercial_convenio_movimientos_registrado_chk
  CHECK (origen = 'mba3' OR registrado_por_id IS NOT NULL);

-- Un renglón de origen se refleja UNA sola vez por línea de convenio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenio_movimientos_referencia
  ON comercial_convenio_movimientos(convenio_producto_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

-- Estado de la sincronización (una sola fila): hasta qué fecha ya se cubrió y qué pasó en la última vuelta.
CREATE TABLE IF NOT EXISTS comercial_convenio_sync_mba3 (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ultima_fecha_cubierta DATE,
  ultima_ejecucion TIMESTAMPTZ,
  ultima_ejecucion_ok TIMESTAMPTZ,
  ultimo_resultado JSONB
);
INSERT INTO comercial_convenio_sync_mba3 (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
