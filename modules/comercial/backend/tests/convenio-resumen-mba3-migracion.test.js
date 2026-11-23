// Migración 007 (foto del resumen MBA3 por línea): idempotente, replicada en init.sql y aplicada
// siempre en supabase-db-init. Pruebas por lectura de archivos.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");
const MIGRACION = leer("modules/comercial/backend/migrations/007-convenio-resumen-mba3.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE = leer("docker-compose.supabase.yml");

describe("Migración 007 resumen MBA3 por línea", () => {
  it.each([["la migración", MIGRACION], ["init.sql", INIT]])("%s crea la tabla de forma idempotente con borrado en cascada", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_convenio_resumen_mba3/);
    expect(sql).toMatch(/convenio_producto_id INT PRIMARY KEY REFERENCES comercial_convenio_productos\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/existencia NUMERIC NOT NULL DEFAULT 0/);
  });

  it("docker-compose.supabase.yml monta y aplica la 007 en db-init", () => {
    expect(COMPOSE).toMatch(/007-convenio-resumen-mba3\.sql:\/sql\/comercial-007-convenio-resumen-mba3\.sql:ro/);
    expect(COMPOSE).toMatch(/psql -v ON_ERROR_STOP=1 -f \/sql\/comercial-007-convenio-resumen-mba3\.sql/);
  });
});
