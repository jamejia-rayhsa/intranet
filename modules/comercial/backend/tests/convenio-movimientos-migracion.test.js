// Pruebas por lectura de archivos (mismo patrón que mba3-cache-migracion.test.js): la migración
// 005 (movimientos de convenio, Fase 4) es idempotente, está replicada en init.sql y se aplica
// siempre en supabase-db-init.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/comercial/backend/migrations/005-convenio-movimientos.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE_SUPABASE = leer("docker-compose.supabase.yml");

describe("Migración 005 movimientos de convenio (Fase 4)", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s crea la tabla de forma idempotente con tipo, cantidad > 0 y orden_compra", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_convenio_movimientos/);
    expect(sql).toMatch(/tipo TEXT NOT NULL CHECK \(tipo IN \('compra_inicial', 'consumo'\)\)/);
    expect(sql).toMatch(/cantidad NUMERIC NOT NULL CHECK \(cantidad > 0\)/);
    expect(sql).toMatch(/orden_compra TEXT/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s solo permite UNA compra_inicial por línea (índice único parcial)", (_n, sql) => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_convenio_movimientos_compra_inicial\s+ON comercial_convenio_movimientos\(convenio_producto_id\)\s+WHERE tipo = 'compra_inicial'/,
    );
  });

  it("supabase-db-init monta y aplica siempre la migración 005 (no solo en init.sql)", () => {
    expect(COMPOSE_SUPABASE).toMatch(
      /modules\/comercial\/backend\/migrations\/005-convenio-movimientos\.sql:\/sql\/comercial-005-convenio-movimientos\.sql:ro/,
    );
    expect(COMPOSE_SUPABASE).toMatch(/psql -v ON_ERROR_STOP=1 -f \/sql\/comercial-005-convenio-movimientos\.sql/);
  });
});
