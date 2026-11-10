-- modules/comercial/backend/migrations/004-convenios-origen-historico.sql
-- Correcciones post-revisión de la Fase 3 (carga histórica del CSV): distingue un convenio creado
-- desde la UI de uno importado por scripts/comercial/importar-convenios-historicos.js. Sin esto, la
-- comprobación de idempotencia de la carga histórica (folio_origen + cliente_nombre) podía colisionar
-- con un convenio creado a mano cuyo folio es texto libre (R-P3-2 de reviews.md).

ALTER TABLE comercial_convenios ADD COLUMN IF NOT EXISTS origen_historico BOOLEAN NOT NULL DEFAULT false;

-- R-P3-11: índice único parcial para que dos corridas simultáneas del script no dupliquen el mismo
-- folio+cliente+vendedor histórico. Incluye vendedor_nombre porque un mismo folio+cliente SÍ puede
-- dividirse legítimamente en más de un convenio histórico cuando trae más de un VENDEDOR distinto
-- (ver agruparFilas() del script); sin vendedor_nombre en la clave este índice rompería ese caso real.
-- lower(btrim(...)) es una aproximación en SQL a la normalización que ya hace el script en JS
-- (normalizarClave): suficiente para bloquear duplicados exactos o con espacios/mayúsculas distintos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenios_historico_folio_cliente_vendedor
  ON comercial_convenios (folio_origen, lower(btrim(cliente_nombre)), lower(btrim(vendedor_nombre)))
  WHERE origen_historico;
