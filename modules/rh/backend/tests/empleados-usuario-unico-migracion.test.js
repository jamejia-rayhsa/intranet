// Migración 010 (UNIQUE empleados.usuario_id): existe, no falla con duplicados existentes, está en
// init.sql y cableada en docker-compose.supabase.yml. El comportamiento SQL real (con y sin duplicados,
// idempotente) se verificó contra Postgres desechable (ver code-notes.md).
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");
const MIGRACION = leer("modules/rh/backend/migrations/010-empleados-usuario-unico.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE = leer("docker-compose.supabase.yml");
const normalizar = (sql) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("Migración 010: un usuario, un empleado", () => {
  it("agrega la restricción UNIQUE (usuario_id) solo si no existe una y no hay duplicados", () => {
    expect(MIGRACION).toMatch(/ADD CONSTRAINT empleados_usuario_id_unique UNIQUE \(usuario_id\)/);
    expect(MIGRACION).toMatch(/IF EXISTS \(/); // ya hay una restricción única: no hace nada
    expect(MIGRACION).toMatch(/HAVING COUNT\(\*\) > 1/); // busca duplicados antes
  });

  it("con duplicados NO falla: avisa con WARNING (no EXCEPTION) y no borra datos", () => {
    expect(MIGRACION).toMatch(/RAISE WARNING/);
    expect(MIGRACION).not.toMatch(/RAISE EXCEPTION/);
    expect(MIGRACION).not.toMatch(/DELETE|TRUNCATE|DROP/i);
  });

  it("está replicada en init.sql", () => {
    expect(normalizar(INIT)).toContain(normalizar(MIGRACION));
  });

  it("está cableada en el db-init (volumen y comando con ON_ERROR_STOP)", () => {
    expect(COMPOSE).toContain("010-empleados-usuario-unico.sql:/sql/010-empleados-usuario-unico.sql:ro");
    expect(COMPOSE).toContain("psql -v ON_ERROR_STOP=1 -f /sql/010-empleados-usuario-unico.sql");
  });
});
