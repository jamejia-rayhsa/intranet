// Pruebas por lectura de archivos (mismo patrón que convenios-migracion.test.js / mba3-cache-migracion.test.js):
// la migración 004 (origen_historico, R-P3-2) es idempotente, está replicada en init.sql y se
// aplica siempre en supabase-db-init (necesario porque init.sql solo corre en una BD nueva).
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/comercial/backend/migrations/004-convenios-origen-historico.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE_SUPABASE = leer("docker-compose.supabase.yml");

describe("Migración 004 origen_historico de convenios", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s agrega la columna de forma idempotente, con default false", (_n, sql) => {
    expect(sql).toMatch(
      /ALTER TABLE comercial_convenios ADD COLUMN IF NOT EXISTS origen_historico BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s crea un índice único parcial por folio+cliente+vendedor solo para históricos", (_n, sql) => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenios_historico_folio_cliente_vendedor/);
    expect(sql).toMatch(/ON comercial_convenios \(folio_origen, lower\(btrim\(cliente_nombre\)\), lower\(btrim\(vendedor_nombre\)\)\)/);
    expect(sql).toMatch(/WHERE origen_historico/);
  });

  it("supabase-db-init monta y aplica siempre la migración 004 de convenios (no solo en init.sql)", () => {
    expect(COMPOSE_SUPABASE).toMatch(
      /modules\/comercial\/backend\/migrations\/004-convenios-origen-historico\.sql:\/sql\/comercial-004-convenios-origen-historico\.sql:ro/,
    );
    expect(COMPOSE_SUPABASE).toMatch(/psql -v ON_ERROR_STOP=1 -f \/sql\/comercial-004-convenios-origen-historico\.sql/);
  });
});
