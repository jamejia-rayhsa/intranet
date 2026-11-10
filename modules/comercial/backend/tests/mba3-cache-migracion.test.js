// Pruebas por lectura de archivos (mismo patrón que convenios-migracion.test.js): la migración
// 003 (caché local de catálogos MBA3) es idempotente, está replicada en init.sql y se aplica
// siempre en supabase-db-init (necesario porque init.sql solo corre en una BD nueva).
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/comercial/backend/migrations/003-mba3-cache.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE_SUPABASE = leer("docker-compose.supabase.yml");

describe("Migración 003 caché MBA3", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s crea la tabla de caché de forma idempotente con clave (tipo, codigo)", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_cache_mba3/);
    expect(sql).toMatch(/PRIMARY KEY \(tipo, codigo\)/);
    expect(sql).toMatch(/datos JSONB NOT NULL/);
  });

  it("supabase-db-init monta y aplica siempre la migración 003 (no solo en init.sql)", () => {
    expect(COMPOSE_SUPABASE).toMatch(
      /modules\/comercial\/backend\/migrations\/003-mba3-cache\.sql:\/sql\/comercial-003-mba3-cache\.sql:ro/,
    );
    expect(COMPOSE_SUPABASE).toMatch(/psql -v ON_ERROR_STOP=1 -f \/sql\/comercial-003-mba3-cache\.sql/);
  });
});
