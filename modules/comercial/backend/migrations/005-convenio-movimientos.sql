-- Fase 4 de Convenios de compra: registro real de consumo y tiempo estimado para agotar el stock.
--
-- Decisiones del humano (2026-11-10):
-- 1. No existe un campo fijo de "cantidad total comprada" en comercial_convenio_productos; el
--    stock inicial se registra como el PRIMER movimiento (tipo='compra_inicial') de esta tabla,
--    no como una columna aparte.
-- 2. Un convenio compra una sola vez y se factura periódicamente hasta agotar ese stock: no hay
--    reabastecimiento a mitad de convenio (si se necesita más, es un convenio nuevo). Por eso
--    solo puede existir UNA fila 'compra_inicial' por línea de producto (índice único parcial).
-- 3. "Tiempo estimado para agotar el stock" se calcula con el ritmo REAL de los movimientos de
--    consumo ya registrados (promedio); si todavía no hay ninguno, el llamador usa
--    cantidad_periodica (el plan original) como respaldo — eso se calcula en el modelo/controlador,
--    no aquí.
CREATE TABLE IF NOT EXISTS comercial_convenio_movimientos (
  id SERIAL PRIMARY KEY,
  convenio_producto_id INT NOT NULL REFERENCES comercial_convenio_productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra_inicial', 'consumo')),
  cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
  fecha_movimiento DATE NOT NULL,
  -- Orden de compra del material (petición del humano, 2026-11-10): referencia libre al proveedor;
  -- aplica sobre todo a 'compra_inicial', pero no se restringe por tipo (texto libre, opcional).
  orden_compra TEXT,
  comentario TEXT,
  registrado_por_id INT NOT NULL REFERENCES usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comercial_convenio_movimientos_producto
  ON comercial_convenio_movimientos(convenio_producto_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenio_movimientos_compra_inicial
  ON comercial_convenio_movimientos(convenio_producto_id)
  WHERE tipo = 'compra_inicial';
