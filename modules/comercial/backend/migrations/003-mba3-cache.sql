-- modules/comercial/backend/migrations/003-mba3-cache.sql
-- Fase 2 de "Convenios de compra": caché local de catálogos MBA3 (cliente/vendedor/producto/
-- existencias-ventas), para no depender de la latencia/disponibilidad de la API externa en cada
-- búsqueda del formulario ni, más adelante, en cada render del dashboard (Fase 5). El TTL por tipo
-- vive en el código (mba3Catalogo.service.js), no en esta tabla: aquí solo se guarda el último
-- dato conocido y cuándo se consultó.

CREATE TABLE IF NOT EXISTS comercial_cache_mba3 (
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  datos JSONB NOT NULL,
  consultado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_comercial_cache_mba3_consultado_en ON comercial_cache_mba3(consultado_en);
