-- 007: foto del resumen MBA3 por línea de convenio (alimenta el dashboard sin consultar MBA3 en cada
-- apertura). Idempotente. El recálculo (botón "Actualizar desde MBA3") la reescribe completa.
-- Reutiliza comercial_convenio_sync_mba3 (fila única, migración 006) como estado de la última corrida.
CREATE TABLE IF NOT EXISTS comercial_convenio_resumen_mba3 (
  convenio_producto_id INT PRIMARY KEY REFERENCES comercial_convenio_productos(id) ON DELETE CASCADE,
  comprado NUMERIC NOT NULL DEFAULT 0,
  vendido NUMERIC NOT NULL DEFAULT 0,
  existencia NUMERIC NOT NULL DEFAULT 0,
  ordenes_compra INT NOT NULL DEFAULT 0,
  facturas INT NOT NULL DEFAULT 0,
  ultima_oc DATE,
  ultima_factura DATE,
  error TEXT,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
