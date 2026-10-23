// Pruebas por lectura de archivos: la migración 014 (motor de análisis) es idempotente, activa RLS en sus tablas,
// no duplica columnas de la 012, está replicada en init.sql (paridad) y cableada en el compose y en docs/supabase.md.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");
const MIGRACION = leer("modules/rh/backend/migrations/014-asistencia-motor.sql");
const MIG_012 = leer("modules/rh/backend/migrations/012-asistencia.sql");
const MIG_013 = leer("modules/rh/backend/migrations/013-asistencia-llaves.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE = leer("docker-compose.supabase.yml");
const DOCS = leer("docs/supabase.md");

const normalizar = (sql) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join(" ").replace(/\s+/g, " ").trim();
const SQL = normalizar(MIGRACION);
const TABLAS = ["asistencia_parametros", "asistencia_periodos", "asistencia_ajustes_pendientes", "asistencia_ejecuciones"];

describe("Migración 014 - esquema", () => {
  it.each(TABLAS)("%s se crea con IF NOT EXISTS", (t) => {
    expect(SQL).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(`));
  });

  it("es idempotente: sin DROP TABLE, TRUNCATE ni DELETE; índices con IF NOT EXISTS; columnas con IF NOT EXISTS", () => {
    expect(SQL).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    for (const m of SQL.matchAll(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g)) throw new Error(`índice sin IF NOT EXISTS: ${m[0]}`);
    expect(SQL.match(/ADD COLUMN (?!IF NOT EXISTS)/g)).toBeNull();
    expect(SQL).toMatch(/DROP TRIGGER IF EXISTS trg_asistencia_diaria_periodo_abierto/);
  });

  it("siembra los 7 parámetros con ON CONFLICT DO NOTHING (nunca pisa lo editado por RH)", () => {
    expect(SQL).toMatch(/INSERT INTO asistencia_parametros \(clave, valor, descripcion\) VALUES/);
    expect(SQL).toMatch(/ON CONFLICT \(clave\) DO NOTHING/);
    for (const [clave, valor] of [
      ["analisis_desde", "2026-09-01"], ["cierre_automatico_desde", "2026-10-16"], ["dias_cierre", "3"],
      ["margen_dia_completo_min", "120"], ["version_motor", "1"], ["ventana_seguridad_dias", "7"], ["barrido_completo_horas", "24"],
    ]) {
      expect(SQL).toContain(`('${clave}', '${valor}'`);
    }
  });

  it("asistencia_periodos: UNIQUE(fecha_inicio), estados, tipo de cierre, coherencia del cierre y sin traslape", () => {
    expect(SQL).toMatch(/CONSTRAINT asistencia_periodos_inicio_key UNIQUE \(fecha_inicio\)/);
    expect(SQL).toMatch(/estado IN \('abierto', 'cerrado'\)/);
    expect(SQL).toMatch(/tipo_cierre IS NULL OR tipo_cierre IN \('auto', 'manual'\)/);
    expect(SQL).toMatch(/estado = 'abierto' OR \(cerrado_en IS NOT NULL AND tipo_cierre IS NOT NULL\)/);
    expect(SQL).toMatch(/EXCLUDE USING gist \(daterange\(fecha_inicio, fecha_fin, '\[\]'\) WITH &&\)/);
    for (const c of ["cerrado_en", "cerrado_por", "reabierto_en", "reabierto_por", "reabierto_motivo", "no_cerrar_automatico"]) {
      expect(SQL).toContain(c);
    }
  });

  it("asistencia_diaria: nuevos estatus y snapshot del turno sin duplicar columnas de la 012", () => {
    const tabla012 = MIG_012.slice(MIG_012.indexOf("CREATE TABLE IF NOT EXISTS asistencia_diaria"));
    const existentes = [...tabla012.slice(0, tabla012.indexOf(");")).matchAll(/^\s{2}([a-z_]+) /gm)].map((m) => m[1]);
    const nuevas = [...MIGRACION.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]);
    expect(nuevas.length).toBeGreaterThanOrEqual(15);
    for (const n of nuevas) expect(existentes).not.toContain(n);
    for (const c of ["periodo_id", "origen_turno", "turno_nombre", "entrada_programada", "salida_programada", "tolerancia_retardo_min",
      "tolerancia_salida_min", "umbral_falta_min", "ventana_entrada_antes_min", "ventana_salida_despues_min", "descanso_inicio",
      "descanso_min", "marcas_usadas", "detalle", "departamento_id"]) {
      expect(nuevas).toContain(c);
    }
    expect(SQL).toMatch(/origen_turno IS NULL OR origen_turno IN \('departamento', 'empleado'\)/);
    for (const s of ["pendiente", "no_aplica", "sin_identificador"]) expect(SQL).toContain(`'${s}'`);
    // la restricción de estatus conserva los 11 estatus de la 012
    for (const s of ["puntual", "retardo", "falta", "salida_anticipada", "incompleta", "vacaciones", "permiso", "descanso", "festivo", "justificada", "sin_turno"]) {
      expect(SQL).toContain(`'${s}'`);
    }
  });

  it("trigger: un día de un periodo cerrado no se inserta ni se recalcula, pero sí cambian las FK de referencia", () => {
    expect(SQL).toMatch(/BEFORE INSERT OR UPDATE ON asistencia_diaria/);
    expect(SQL).toMatch(/estado_periodo = 'cerrado'/);
    expect(SQL).toMatch(/IS DISTINCT FROM/);
    expect(MIGRACION).not.toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON asistencia_diaria/);
  });

  it("asistencia_ajustes_pendientes: una fila por marca y motivos acotados", () => {
    expect(SQL).toMatch(/CONSTRAINT asistencia_ajustes_marca_key UNIQUE \(marca_id\)/);
    expect(SQL).toMatch(/motivo IN \('marca_posterior_cierre', 'marca_vinculada_posterior_cierre'\)/);
    expect(SQL).toMatch(/resuelto_en TIMESTAMPTZ, resuelto_por INT REFERENCES usuarios\(id\)/);
  });

  it("asistencia_ejecuciones: tipos, orígenes y estados acotados; sin columnas de datos personales", () => {
    expect(SQL).toMatch(/tipo IN \('incremental', 'completa', 'manual', 'cierre', 'reapertura'\)/);
    expect(SQL).toMatch(/origen IN \('planificador', 'api', 'cli'\)/);
    expect(SQL).toMatch(/estado IN \('en_curso', 'ok', 'parcial', 'error'\)/);
    expect(SQL).not.toMatch(/empleado_id[^,]*,[^)]*asistencia_ejecuciones/);
  });

  it("toda clave foránea nueva tiene su índice", () => {
    const fks = [...SQL.matchAll(/ ([a-z_]+) (?:INT|BIGINT) (?:NOT NULL )?REFERENCES/g)].map((m) => m[1]);
    // marca_id ya tiene el índice único de asistencia_ajustes_marca_key
    for (const fk of new Set(fks)) if (fk !== "marca_id") expect(SQL).toMatch(new RegExp(`INDEX IF NOT EXISTS [a-z_]+ ON [a-z_]+\\(${fk}[,)]`));
  });

  it("no toca las migraciones 012 ni 013", () => {
    expect(normalizar(MIG_012)).not.toMatch(/asistencia_periodos|asistencia_parametros/);
    expect(normalizar(MIG_013)).not.toMatch(/asistencia_periodos|asistencia_parametros/);
    expect(SQL).not.toMatch(/ALTER TABLE (?!asistencia_)/);
    expect(SQL).not.toMatch(/CREATE (ROLE|USER)/i);
  });
});

describe("Migración 014 - RLS", () => {
  it.each(TABLAS)("%s tiene RLS y se revoca a anon/authenticated", (t) => {
    expect(SQL).toMatch(new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(SQL).toMatch(new RegExp(`REVOKE ALL ON [^;]*${t}[^;]* FROM anon, authenticated`));
  });

  it("revoca también las secuencias y la función del trigger", () => {
    expect(SQL).toMatch(/REVOKE ALL ON SEQUENCE asistencia_periodos_id_seq, asistencia_ajustes_pendientes_id_seq, asistencia_ejecuciones_id_seq FROM anon, authenticated/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION asistencia_diaria_periodo_abierto\(\) FROM anon, authenticated/);
  });
});

describe("Migración 014 - réplica y cableado", () => {
  it("el cuerpo está contenido en init.sql (comparación normalizada), al final y después de la 013", () => {
    expect(normalizar(INIT)).toContain(normalizar(MIGRACION));
    expect(INIT.indexOf("014-asistencia-motor.sql")).toBeGreaterThan(INIT.indexOf("013-asistencia-llaves.sql"));
  });

  it("el compose monta la 014 y la aplica después de la 013 y antes de la 004 final", () => {
    expect(COMPOSE).toContain("./modules/rh/backend/migrations/014-asistencia-motor.sql:/sql/014-asistencia-motor.sql:ro");
    const i014 = COMPOSE.indexOf("-f /sql/014-asistencia-motor.sql");
    expect(i014).toBeGreaterThan(COMPOSE.indexOf("-f /sql/013-asistencia-llaves.sql"));
    const veces004 = [...COMPOSE.matchAll(/psql -v ON_ERROR_STOP=1 -f \/sql\/004-rls-deny-all\.sql/g)].map((m) => m.index);
    expect(veces004).toHaveLength(2);
    expect(veces004[1]).toBeGreaterThan(i014);
  });

  it("docs/supabase.md documenta la 014, sus tablas y el trigger", () => {
    expect(DOCS).toMatch(/rh\/014-asistencia-motor\.sql/);
    for (const t of TABLAS) expect(DOCS).toContain(t);
    expect(DOCS).toMatch(/ASISTENCIA_MOTOR_\*|motor-analisis\.md/);
  });
});
