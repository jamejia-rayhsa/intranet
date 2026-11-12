// Migración 006 (consumo automático desde MBA3): idempotente, replicada en init.sql y aplicada
// siempre en supabase-db-init. Pruebas por lectura de archivos.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/comercial/backend/migrations/006-convenio-movimientos-mba3.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE_SUPABASE = leer("docker-compose.supabase.yml");

describe("Migración 006 movimientos automáticos desde MBA3", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s agrega el tipo 'devolucion', origen, referencia_externa y la unicidad por línea", (_n, sql) => {
    expect(sql).toMatch(/CHECK \(tipo IN \('compra_inicial', 'consumo', 'devolucion'\)\)/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS referencia_externa TEXT/);
    expect(sql).toMatch(/CHECK \(origen IN \('manual', 'mba3'\)\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenio_movimientos_referencia\s+ON comercial_convenio_movimientos\(convenio_producto_id, referencia_externa\)\s+WHERE referencia_externa IS NOT NULL/,
    );
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s hace registrado_por_id opcional SOLO para origen mba3", (_n, sql) => {
    expect(sql).toMatch(/ALTER COLUMN registrado_por_id DROP NOT NULL/);
    expect(sql).toMatch(/CHECK \(origen = 'mba3' OR registrado_por_id IS NOT NULL\)/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s crea la tabla de estado de una sola fila", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_convenio_sync_mba3/);
    expect(sql).toMatch(/CHECK \(id = 1\)/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it("la migración es idempotente (constraints con DROP IF EXISTS antes de crearlas)", () => {
    expect(MIGRACION).toMatch(/DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_tipo_check/);
    expect(MIGRACION).toMatch(/DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_origen_check/);
    expect(MIGRACION).toMatch(/DROP CONSTRAINT IF EXISTS comercial_convenio_movimientos_registrado_chk/);
  });

  it("supabase-db-init monta y aplica siempre la migración 006", () => {
    expect(COMPOSE_SUPABASE).toMatch(
      /modules\/comercial\/backend\/migrations\/006-convenio-movimientos-mba3\.sql:\/sql\/comercial-006-convenio-movimientos-mba3\.sql:ro/,
    );
    expect(COMPOSE_SUPABASE).toMatch(/psql -v ON_ERROR_STOP=1 -f \/sql\/comercial-006-convenio-movimientos-mba3\.sql/);
  });
});
