// Pruebas por lectura de archivos: la migración 012 (asistencia) es idempotente, activa RLS en TODAS
// sus tablas, está replicada en init.sql y cableada en docker-compose.supabase.yml y docs.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/rh/backend/migrations/012-asistencia.sql");
const INIT = leer("config/database/init.sql");
const COMPOSE = leer("docker-compose.supabase.yml");
const DOCS = leer("docs/supabase.md");
const APP = leer("modules/portal/backend/app.js");

const normalizar = (sql) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const TABLAS = [
  "turnos",
  "turno_dias",
  "turno_departamento",
  "turno_empleado",
  "asistencia_sync_lotes",
  "asistencia_sync_estado",
  "asistencia_marcas",
  "asistencia_incidencias",
  "asistencia_diaria",
];

describe("Migración 012 asistencia - esquema", () => {
  it("crea exactamente las 9 tablas esperadas, todas con IF NOT EXISTS", () => {
    const creadas = [...MIGRACION.matchAll(/CREATE TABLE (IF NOT EXISTS )?(\w+)/g)];
    expect(creadas.map((m) => m[2]).sort()).toEqual([...TABLAS].sort());
    creadas.forEach((m) => expect(m[1]).toBeTruthy());
  });

  it("es idempotente: índices IF NOT EXISTS, trigger recreado, extensión y semillas protegidas", () => {
    expect(MIGRACION).toMatch(/CREATE EXTENSION IF NOT EXISTS btree_gist/);
    for (const m of MIGRACION.matchAll(/CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?\w+/g)) {
      expect(m[2]).toBeTruthy();
    }
    expect(MIGRACION).toMatch(/DROP TRIGGER IF EXISTS trg_asistencia_marcas_inmutable/);
    expect(MIGRACION).toMatch(/CREATE OR REPLACE FUNCTION asistencia_marcas_inmutable/);
    expect(MIGRACION.match(/ON CONFLICT/g).length).toBeGreaterThanOrEqual(4);
  });

  it("las vigencias no se traslapan: EXCLUDE con btree_gist por departamento y por empleado", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/turno_departamento_sin_traslape EXCLUDE USING gist \(departamento_id WITH =, daterange\(vigente_desde, vigente_hasta, '\[\]'\) WITH &&\)/);
    expect(sql).toMatch(/turno_empleado_sin_traslape EXCLUDE USING gist \(empleado_id WITH =, daterange\(vigente_desde, vigente_hasta, '\[\]'\) WITH &&\)/);
    expect(sql).toMatch(/vigente_hasta IS NULL OR vigente_hasta >= vigente_desde/);
  });

  it("turno_dias: día 1..7, un día por turno y coherencia de horas con CHECK", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/dia_semana SMALLINT NOT NULL CHECK \(dia_semana BETWEEN 1 AND 7\)/);
    expect(sql).toMatch(/PRIMARY KEY \(turno_id, dia_semana\)/);
    expect(sql).toMatch(/cruza_medianoche = \(hora_salida < hora_entrada\)/);
    expect(sql).toMatch(/hora_entrada <> hora_salida/);
  });

  it("turnos: valores por omisión de BioTime (10/30/0, ventanas 60/150/5/359) y umbral >= tolerancia", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/tolerancia_retardo_min INT NOT NULL DEFAULT 10/);
    expect(sql).toMatch(/umbral_falta_min INT NOT NULL DEFAULT 30/);
    expect(sql).toMatch(/tolerancia_salida_min INT NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ventana_entrada_antes_min INT NOT NULL DEFAULT 60/);
    expect(sql).toMatch(/ventana_entrada_despues_min INT NOT NULL DEFAULT 150/);
    expect(sql).toMatch(/ventana_salida_antes_min INT NOT NULL DEFAULT 5/);
    expect(sql).toMatch(/ventana_salida_despues_min INT NOT NULL DEFAULT 359/);
    expect(sql).toMatch(/descanso_min INT NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/umbral_falta_min >= tolerancia_retardo_min/);
    expect(sql).toMatch(/descanso_min = 0 OR descanso_inicio IS NOT NULL/);
    expect(MIGRACION).not.toMatch(/\bnocturno\b\s+BOOLEAN/i); // nocturno se deriva, no es columna
  });

  it("marcas: UNIQUE(origen, id_externo), subida_ts, índices y trigger de inmutabilidad", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/UNIQUE \(origen, id_externo\)/);
    expect(sql).toMatch(/subida_ts TIMESTAMPTZ/);
    expect(sql).toMatch(/marca_ts TIMESTAMPTZ NOT NULL/);
    expect(sql).toMatch(/idx_asistencia_marcas_codigo_ts ON asistencia_marcas\(codigo_empleado, marca_ts\)/);
    expect(sql).toMatch(/idx_asistencia_marcas_empleado_ts ON asistencia_marcas\(empleado_id, marca_ts\)/);
    expect(sql).toMatch(/idx_asistencia_marcas_ts ON asistencia_marcas\(marca_ts\)/);
    expect(sql).toMatch(/empleado_id INT REFERENCES empleados\(id\) ON DELETE SET NULL/); // huérfanas permitidas
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON asistencia_marcas/);
    // La marca original no cambia: subida_ts y las demás columnas crudas están en la comparación
    expect(sql).toMatch(/NEW\.marca_ts, NEW\.subida_ts/);
    expect(sql).toMatch(/OLD\.marca_ts, OLD\.subida_ts/);
    // empleado_id es lo único que puede cambiar: no está en la comparación de la función de inmutabilidad
    const funcion = sql.slice(sql.indexOf("FUNCTION asistencia_marcas_inmutable"), sql.indexOf("DROP TRIGGER IF EXISTS trg_asistencia_marcas_inmutable"));
    expect(funcion.length).toBeGreaterThan(100);
    expect(funcion).not.toMatch(/NEW\.empleado_id/);
  });

  it("lotes: estatus (en_curso/ok/error), error y sin_empleado; sin lote_externo ni su UNIQUE; sin llave_id (Fase 3)", () => {
    const sql = normalizar(MIGRACION);
    const lotes = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS asistencia_sync_lotes"), sql.indexOf("CREATE TABLE IF NOT EXISTS asistencia_sync_estado"));
    expect(lotes).toMatch(/estatus VARCHAR\(20\) NOT NULL DEFAULT 'en_curso'/);
    expect(lotes).toMatch(/CHECK \(estatus IN \('en_curso', 'ok', 'error'\)\)/);
    expect(lotes).toMatch(/error TEXT/);
    expect(lotes).toMatch(/sin_empleado INT NOT NULL DEFAULT 0/);
    expect(lotes).not.toMatch(/llave_id/);
    expect(sql).not.toMatch(/lote_externo/);
  });

  it("incidencias: la corrección exige marca y hora; la hora exige marca; la marca debe ser del mismo empleado (trigger)", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/tipo <> 'correccion_marca' OR \(marca_id IS NOT NULL AND marca_ts_corregida IS NOT NULL\)/);
    expect(sql).toMatch(/marca_ts_corregida IS NULL OR \(marca_id IS NOT NULL AND tipo = 'correccion_marca'\)/);
    expect(sql).toMatch(/SELECT m\.empleado_id INTO empleado_marca FROM asistencia_marcas m WHERE m\.id = NEW\.marca_id/);
    expect(sql).toMatch(/empleado_marca IS DISTINCT FROM NEW\.empleado_id THEN RAISE EXCEPTION/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF empleado_id, marca_id ON asistencia_incidencias/);
  });

  it("descanso dentro de la jornada: trigger de restricción diferido en turnos y turno_dias", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER trg_turnos_descanso AFTER INSERT OR UPDATE OF descanso_inicio, descanso_min ON turnos DEFERRABLE INITIALLY DEFERRED/);
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER trg_turno_dias_descanso AFTER INSERT OR UPDATE OR DELETE ON turno_dias DEFERRABLE INITIALLY DEFERRED/);
    expect(sql).toMatch(/r\.ini < m\.ent OR r\.ini \+ t\.descanso_min > m\.sal/);
  });

  it.each([
    ["turnos", "creado_por"],
    ["turno_departamento", "creado_por"],
    ["turno_empleado", "creado_por"],
    ["asistencia_sync_estado", "ultimo_lote_id"],
    ["asistencia_marcas", "lote_id"],
    ["asistencia_incidencias", "marca_id"],
    ["asistencia_incidencias", "creado_por"],
    ["asistencia_diaria", "turno_id"],
    ["asistencia_diaria", "solicitud_vacaciones_id"],
    ["asistencia_diaria", "permiso_id"],
    ["asistencia_diaria", "calendario_id"],
    ["asistencia_diaria", "incidencia_id"],
  ])("FK sin índice propio: %s(%s) tiene índice", (tabla, columna) => {
    expect(normalizar(MIGRACION)).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS \\w+ ON ${tabla}\\(${columna}\\)`));
  });

  it("sincronización: cursor por id y por subida", () => {
    const sql = normalizar(MIGRACION);
    expect(sql).toMatch(/ultimo_id_externo BIGINT/);
    expect(sql).toMatch(/ultima_subida_ts TIMESTAMPTZ/);
  });

  it("asistencia_diaria: estatus cerrados, UNIQUE(empleado_id, fecha) y referencias que la explican", () => {
    const sql = normalizar(MIGRACION);
    for (const e of ["puntual", "retardo", "falta", "salida_anticipada", "incompleta", "vacaciones", "permiso", "descanso", "festivo", "justificada", "sin_turno"]) {
      expect(sql).toContain(`'${e}'`);
    }
    expect(sql).toMatch(/UNIQUE \(empleado_id, fecha\)/);
    expect(sql).toMatch(/solicitud_vacaciones_id INT REFERENCES solicitudes_vacaciones\(id\)/);
    expect(sql).toMatch(/permiso_id INT REFERENCES permisos_ausencia\(id\)/);
    expect(sql).toMatch(/calendario_id INT REFERENCES calendario_laboral\(id\)/);
  });

  it("no hace lo descartado: UNIQUE sobre numero_nomina, roles de BD ni cambios a vacaciones/calendario", () => {
    expect(normalizar(MIGRACION)).not.toMatch(/numero_nomina/i);
    expect(normalizar(MIGRACION)).not.toMatch(/CREATE (ROLE|USER)/i);
    expect(normalizar(MIGRACION)).not.toMatch(/ALTER TABLE (solicitudes_vacaciones|calendario_laboral|empleados|departamentos|permisos_ausencia)/i);
  });
});

describe("Migración 012 asistencia - RLS", () => {
  it.each(TABLAS)("%s tiene ENABLE ROW LEVEL SECURITY en la propia migración", (tabla) => {
    expect(MIGRACION).toMatch(new RegExp(`ALTER TABLE ${tabla}\\s+ENABLE ROW LEVEL SECURITY`));
  });

  it.each(TABLAS)("%s se revoca a anon/authenticated", (tabla) => {
    const bloque = MIGRACION.slice(MIGRACION.indexOf("REVOKE ALL ON turnos"), MIGRACION.indexOf("REVOKE ALL ON SEQUENCE"));
    expect(bloque).toMatch(new RegExp(`\\b${tabla}\\b`));
    expect(bloque).toMatch(/FROM anon, authenticated/);
  });

  it("el REVOKE solo corre si existen los roles de Supabase (Postgres plano no falla)", () => {
    expect(MIGRACION).toMatch(/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'anon'\)/);
  });
});

describe("Migración 012 asistencia - permisos y semilla", () => {
  const sql = normalizar(MIGRACION);

  it("siembra las opciones Asistencia y Turnos del módulo rh con ON CONFLICT", () => {
    expect(sql).toMatch(/\('Asistencia', '[^']+', 9\), \('Turnos', '[^']+', 10\)/);
    expect(sql).toMatch(/WHERE m\.nombre = 'rh' ON CONFLICT \(modulo_id, nombre\) DO NOTHING/);
  });

  it("Asistencia:consulta para roles con Vacaciones/Empleados y rh_empleado; no se concede edicion a ellos", () => {
    expect(sql).toMatch(/prev\.nombre IN \('Vacaciones', 'Empleados'\)[\s\S]*'consulta'/);
    expect(sql).toMatch(/r\.nombre = 'rh_empleado'/);
  });

  it("Turnos (y Asistencia edición) solo rh_admin y super_admin; portal_admin no aparece", () => {
    expect(sql).toMatch(/mo\.nombre IN \('Asistencia', 'Turnos'\) CROSS JOIN \(VALUES \('consulta'\), \('edicion'\)\) AS t\(tipo\) WHERE r\.nombre IN \('rh_admin', 'super_admin'\)/);
    expect(sql).not.toMatch(/portal_admin/);
    expect(MIGRACION).not.toMatch(/'(creacion|eliminacion)'/); // el CHECK solo admite consulta y edicion
  });

  it("siembra Rayhsa y Logística solo si turnos está vacía y NO los asigna a ningún departamento", () => {
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM turnos\) THEN RETURN/);
    expect(sql).toMatch(/ARRAY\['Rayhsa', 'Logística'\]/);
    expect(sql).toMatch(/CASE WHEN nombre_turno = 'Rayhsa' THEN 3 ELSE 0 END/); // salida anticipada
    expect(sql).toMatch(/CASE WHEN nombre_turno = 'Rayhsa' THEN 5 ELSE 0 END/); // ventana de salida
    expect(sql).toMatch(/'13:00', 60/);
    expect(sql).toMatch(/TIME '08:00'[\s\S]*TIME '18:00'/);
    expect(sql).not.toMatch(/INSERT INTO turno_departamento|INSERT INTO turno_empleado/);
  });
});

describe("Migración 012 asistencia - réplica y cableado", () => {
  it("el cuerpo de la migración está contenido en init.sql (comparación normalizada)", () => {
    expect(normalizar(INIT)).toContain(normalizar(MIGRACION));
  });

  it("init.sql coloca la 012 al final, después de la 011", () => {
    expect(INIT.indexOf("012-asistencia.sql")).toBeGreaterThan(INIT.indexOf("011-calendario-actividad.sql"));
  });

  it("el compose monta la 012 y la aplica después de la 011", () => {
    expect(COMPOSE).toContain("./modules/rh/backend/migrations/012-asistencia.sql:/sql/012-asistencia.sql:ro");
    expect(COMPOSE.indexOf("-f /sql/012-asistencia.sql")).toBeGreaterThan(COMPOSE.indexOf("-f /sql/011-calendario-actividad.sql"));
  });

  it("la 004 (RLS deny-all) se ejecuta otra vez AL FINAL del db-init, después de la 012 y antes de 'listo'", () => {
    const veces = [...COMPOSE.matchAll(/psql -v ON_ERROR_STOP=1 -f \/sql\/004-rls-deny-all\.sql/g)].map((m) => m.index);
    expect(veces).toHaveLength(2);
    expect(veces[0]).toBeLessThan(COMPOSE.indexOf("-f /sql/009-calendario-laboral.sql"));
    expect(veces[1]).toBeGreaterThan(COMPOSE.indexOf("-f /sql/012-asistencia.sql"));
    expect(veces[1]).toBeLessThan(COMPOSE.indexOf('echo "[db-init] listo"'));
  });

  it("docs/supabase.md documenta la 012, btree_gist y la 004 final", () => {
    expect(DOCS).toMatch(/rh\/012-asistencia\.sql/);
    expect(DOCS).toMatch(/btree_gist/);
    expect(DOCS).toMatch(/vuelve a aplicar la `004`/);
  });

  it("app.js monta /api/asistencia", () => {
    expect(APP).toMatch(/app\.use\("\/api\/asistencia", require\("\.\.\/\.\.\/rh\/backend\/routes\/asistencia\.routes"\)\)/);
  });
});

describe("Archivos de asistencia - sin datos reales de la red de BioTime", () => {
  const archivos = [
    "modules/rh/backend/migrations/012-asistencia.sql",
    "modules/rh/backend/utils/turnoValidacion.js",
    "modules/rh/backend/models/turno.model.js",
    "modules/rh/backend/models/turnoAsignacion.model.js",
    "docs/supabase.md",
    "docs/asistencia/contrato-ingesta-marcas.md",
  ];
  it.each(archivos)("%s no contiene IPs privadas ni números de serie de terminal", (archivo) => {
    const texto = leer(archivo);
    expect(texto).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(texto).not.toMatch(/\bCN(96\d*|\d{8,})\b/);
  });
});

describe("Contrato de ingesta - ejemplos ficticios", () => {
  const contrato = leer("docs/asistencia/contrato-ingesta-marcas.md");
  it("no usa el id, los instantes ni el alias de un registro real", () => {
    expect(contrato).not.toMatch(/\b15[67]\d{4}\b|2026-10-21T/); // ids de iclock_transaction y fechas de registros reales (patrón genérico)
    expect(contrato).toContain('"id_externo": "1000123"');
    expect(contrato).toContain('"marca_ts": "2026-01-15T14:00:00Z"');
    expect(contrato).toContain('"terminal_alias": "SEDE-A"');
  });
  it("documenta estatus, error y sin_empleado del lote", () => {
    expect(contrato).toMatch(/`estatus` \(`en_curso`, `ok` o `error`\)/);
  });
});
