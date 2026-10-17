// Pruebas por lectura de archivos: la migración 009 existe, es idempotente, siembra los 14 festivos
// y está replicada en init.sql y cableada en docker-compose.supabase.yml.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/rh/backend/migrations/009-calendario-laboral.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE = leer("docker-compose.supabase.yml");
const MIGRACION_011 = leer("modules/rh/backend/migrations/011-calendario-actividad.sql");
const DOCS = leer("docs/supabase.md");

// Fechas esperadas calculadas por regla (Ley Federal del Trabajo, art. 74), no copiadas del SQL.
const nesimoLunes = (anio, mes, n) => {
  const dia1 = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay(); // 0 = domingo
  const primerLunes = 1 + ((8 - dia1) % 7);
  return primerLunes + 7 * (n - 1);
};
const iso = (a, m, d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const festivosPorRegla = (anio) => [
  iso(anio, 1, 1), // Año Nuevo
  iso(anio, 2, nesimoLunes(anio, 2, 1)), // 1.er lunes de febrero
  iso(anio, 3, nesimoLunes(anio, 3, 3)), // 3.er lunes de marzo
  iso(anio, 5, 1), // Día del Trabajo
  iso(anio, 9, 16), // Independencia
  iso(anio, 11, nesimoLunes(anio, 11, 3)), // 3.er lunes de noviembre
  iso(anio, 12, 25), // Navidad
];
const FESTIVOS = [...festivosPorRegla(2026), ...festivosPorRegla(2027)];

// Sin comentarios ni diferencias de espacios
const normalizar = (sql) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("Migración 009 calendario laboral", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s define la tabla, el cupo y departamento_id de forma idempotente", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS calendario_laboral/);
    expect(sql).toMatch(/tipo IN \('oficial', 'otorgado', 'evento'\)/);
    expect(sql).toMatch(/UNIQUE \(fecha, tipo\)/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_calendario_laboral_fecha/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cupo_vacaciones INT NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/CHECK \(cupo_vacaciones >= 1\)/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS departamento_id INT REFERENCES departamentos\(id\)/);
    expect(sql).toMatch(/idx_sol_vac_depto_fechas[\s\S]*\(departamento_id, estatus, fecha_inicial, fecha_final\)/);
    expect(sql).toMatch(/ON CONFLICT \(fecha, tipo\) DO NOTHING/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s siembra los 14 festivos oficiales de 2026 y 2027", (_n, sql) => {
    const bloque = sql.slice(sql.indexOf("INSERT INTO calendario_laboral"));
    const filas = bloque.match(/\('\d{4}-\d{2}-\d{2}', 'oficial', '[^']+'\)/g) || [];
    expect(filas).toHaveLength(14);
    const delSql = (bloque.match(/\('(\d{4}-\d{2}-\d{2})', 'oficial'/g) || []).map((m) => m.slice(2, 12));
    expect([...delSql].sort()).toEqual([...FESTIVOS].sort());
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s siembra festivos solo si la tabla está vacía (no resucita los borrados)", (_n, sql) => {
    expect(normalizar(sql)).toMatch(/\) AS v\(fecha, tipo, nombre\) WHERE NOT EXISTS \(SELECT 1 FROM calendario_laboral\) ON CONFLICT/);
  });

  it("el cuerpo de la migración 009 está contenido en init.sql (comparación normalizada)", () => {
    expect(normalizar(INIT)).toContain(normalizar(MIGRACION));
  });

  it("el backfill de departamento_id solo toca filas con departamento_id NULL", () => {
    expect(normalizar(MIGRACION)).toMatch(/UPDATE solicitudes_vacaciones s SET departamento_id = e\.departamento_id FROM empleados e WHERE e\.id = s\.empleado_id AND s\.departamento_id IS NULL/);
  });

  it("siembra las opciones Calendario y Departamentos y los permisos (solo consulta/edicion)", () => {
    expect(MIGRACION).toMatch(/'Calendario'/);
    expect(MIGRACION).toMatch(/'Departamentos'/);
    expect(MIGRACION).toMatch(/r\.nombre IN \('rh_admin', 'super_admin', 'portal_admin'\)/);
    expect(MIGRACION).toMatch(/vac\.nombre = 'Vacaciones'/);
    // portal_admin no recibe Departamentos
    const bloqueDeptos = MIGRACION.slice(MIGRACION.indexOf("-- Departamentos: hoy"), MIGRACION.indexOf("-- e)"));
    expect(bloqueDeptos).not.toMatch(/portal_admin/);
    expect(MIGRACION).not.toMatch(/'creacion'|'eliminacion'/);
    expect(MIGRACION).toMatch(/r\.nombre = .rh_empleado./);
  });

  it("init.sql replica los permisos de la migración", () => {
    expect(INIT).toMatch(/'Calendario'/);
    expect(INIT).toMatch(/r\.nombre IN \('rh_admin', 'super_admin', 'portal_admin'\)/);
  });

  it("está montada y aplicada en supabase-db-init", () => {
    expect(COMPOSE).toContain("./modules/rh/backend/migrations/009-calendario-laboral.sql:/sql/009-calendario-laboral.sql:ro");
    expect(COMPOSE).toContain("psql -v ON_ERROR_STOP=1 -f /sql/009-calendario-laboral.sql");
  });

  it("el calendario está montado en el app unificado", () => {
    const app = leer("modules/portal/backend/app.js");
    expect(app).toMatch(/\/api\/calendario-laboral[\s\S]*calendario\.routes/);
  });
});

describe("Migración 011 tipo actividad del calendario", () => {
  const sql011 = normalizar(MIGRACION_011);

  it("amplía el CHECK a los 4 tipos con nombre fijo", () => {
    expect(sql011).toContain("CHECK (tipo IN ('oficial', 'otorgado', 'evento', 'actividad'))");
    expect(sql011).toContain("ADD CONSTRAINT calendario_laboral_tipo_check");
  });

  it("es idempotente: sale si ya admite actividad y busca la restricción por definición (no por nombre)", () => {
    expect(sql011).toMatch(/IF EXISTS \( SELECT 1 FROM pg_constraint WHERE conrelid = 'calendario_laboral'::regclass AND contype = 'c' AND conname = 'calendario_laboral_tipo_check' AND pg_get_constraintdef\(oid\) LIKE '%actividad%' \) THEN RETURN;/);
    // Filtra por la COLUMNA tipo (conkey), no por texto de la definición: un CHECK ajeno no se borra
    expect(sql011).toMatch(/conkey = ARRAY\[\(SELECT attnum FROM pg_attribute WHERE attrelid = 'calendario_laboral'::regclass AND attname = 'tipo'\)\]::smallint\[\]/);
    expect(sql011).not.toMatch(/LIKE '%tipo%'/);
    expect(sql011).toMatch(/DROP CONSTRAINT %I/);
  });

  it("no modifica ni borra datos", () => {
    expect(sql011).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE|INSERT|DROP TABLE)\b/i);
  });

  it("init.sql replica el cuerpo de la 011 DESPUÉS de la 009 y de la 010 (la 009 conserva su CHECK original)", () => {
    expect(normalizar(INIT)).toContain(sql011);
    const iguales = (patron) => INIT.indexOf(patron);
    expect(iguales("calendario_laboral_tipo_check")).toBeGreaterThan(iguales("empleados_usuario_id_unique"));
    expect(iguales("empleados_usuario_id_unique")).toBeGreaterThan(iguales("CREATE TABLE IF NOT EXISTS calendario_laboral"));
  });

  it("está montada y aplicada en supabase-db-init después de la 010 y documentada", () => {
    expect(COMPOSE).toContain("./modules/rh/backend/migrations/011-calendario-actividad.sql:/sql/011-calendario-actividad.sql:ro");
    expect(COMPOSE).toContain("psql -v ON_ERROR_STOP=1 -f /sql/011-calendario-actividad.sql");
    expect(COMPOSE.indexOf("-f /sql/011-calendario-actividad.sql")).toBeGreaterThan(COMPOSE.indexOf("-f /sql/010-empleados-usuario-unico.sql"));
    expect(DOCS).toContain("011-calendario-actividad.sql");
  });
});

