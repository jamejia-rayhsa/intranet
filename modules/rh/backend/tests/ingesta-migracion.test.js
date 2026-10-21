// Pruebas por lectura de archivos: la migración 013 (llaves de ingesta) es idempotente, activa RLS, está replicada en
// init.sql y cableada en el compose y en los docs; app.js monta la ingesta antes del parser global.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/rh/backend/migrations/013-asistencia-llaves.sql");
const MIG_012 = leer("modules/rh/backend/migrations/012-asistencia.sql");
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
const SQL = normalizar(MIGRACION);
const TABLAS = ["asistencia_llaves", "asistencia_llaves_rechazos"];

describe("Migración 013 - llaves de ingesta", () => {
  it("crea exactamente las 2 tablas, con IF NOT EXISTS", () => {
    const creadas = [...MIGRACION.matchAll(/CREATE TABLE (IF NOT EXISTS )?(\w+)/g)];
    expect(creadas.map((m) => m[2]).sort()).toEqual([...TABLAS].sort());
    creadas.forEach((m) => expect(m[1]).toBeTruthy());
  });

  it("nunca guarda la llave: solo hash_llave (SHA-256 hexadecimal, único) y el prefijo visible (único)", () => {
    expect(SQL).toMatch(/hash_llave CHAR\(64\) NOT NULL CHECK \(hash_llave ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(SQL).toMatch(/CONSTRAINT asistencia_llaves_hash_key UNIQUE \(hash_llave\)/);
    expect(SQL).toMatch(/CONSTRAINT asistencia_llaves_prefijo_key UNIQUE \(prefijo\)/);
    expect(SQL).toMatch(/prefijo VARCHAR\(16\) NOT NULL/);
    expect(SQL).not.toMatch(/\b(llave|secreto|api_key|clave)\s+(VARCHAR|TEXT|CHAR)/i);
  });

  it("columnas pedidas: origen, estado (activa/revocada), vigencia desde/hasta, IP permitidas (lista, máx. 20), último uso, creador, revocación", () => {
    expect(SQL).toMatch(/origen VARCHAR\(50\) NOT NULL DEFAULT 'biotime'/);
    expect(SQL).toMatch(/estado VARCHAR\(20\) NOT NULL DEFAULT 'activa'/);
    expect(SQL).toMatch(/CHECK \(estado IN \('activa', 'revocada'\)\)/);
    expect(SQL).toMatch(/vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    expect(SQL).toMatch(/vigente_hasta TIMESTAMPTZ,/);
    expect(SQL).toMatch(/vigente_hasta IS NULL OR vigente_hasta >= vigente_desde/);
    expect(SQL).toMatch(/ips_permitidas TEXT\[\] NOT NULL DEFAULT '\{\}' CHECK \(cardinality\(ips_permitidas\) <= 20\)/);
    expect(SQL).toMatch(/ultimo_uso TIMESTAMPTZ/);
    expect(SQL).toMatch(/creado_por INT REFERENCES usuarios\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/revocada_por INT REFERENCES usuarios\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/fecha_revocacion TIMESTAMPTZ/);
    expect(SQL).toMatch(/\(estado = 'revocada'\) = \(fecha_revocacion IS NOT NULL\)/);
    expect(SQL).toMatch(/reemplaza_a INT REFERENCES asistencia_llaves\(id\)/);
  });

  it("asistencia_sync_lotes recibe llave_id con ADD COLUMN IF NOT EXISTS (idempotente) e índice", () => {
    expect(SQL).toMatch(/ALTER TABLE asistencia_sync_lotes ADD COLUMN IF NOT EXISTS llave_id INT REFERENCES asistencia_llaves\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS idx_asistencia_sync_lotes_llave ON asistencia_sync_lotes\(llave_id\)/);
    expect(normalizar(MIG_012)).not.toMatch(/llave_id/); // la 012 ya aplicada no se tocó
  });

  it("cada FK tiene índice propio", () => {
    for (const [tabla, columna] of [
      ["asistencia_llaves", "creado_por"],
      ["asistencia_llaves", "revocada_por"],
      ["asistencia_llaves", "reemplaza_a"],
      ["asistencia_llaves_rechazos", "llave_id"],
    ]) {
      expect(SQL).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS \\w+ ON ${tabla}\\(${columna}\\)`));
    }
    for (const m of MIGRACION.matchAll(/CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?\w+/g)) expect(m[2]).toBeTruthy();
  });

  it("auditoría acotada: UNIQUE(hora, ip, motivo) con contador y motivos cerrados; no guarda la llave recibida", () => {
    expect(SQL).toMatch(/UNIQUE \(hora, ip, motivo\)/);
    expect(SQL).toMatch(/intentos INT NOT NULL DEFAULT 1 CHECK \(intentos >= 1\)/);
    for (const motivo of ["sin_llave", "llave_malformada", "llave_desconocida", "llave_incorrecta", "llave_revocada", "llave_fuera_de_vigencia", "ip_no_permitida"]) {
      expect(SQL).toContain(`'${motivo}'`);
    }
    expect(SQL).toMatch(/ip VARCHAR\(45\) NOT NULL/);
  });

  it.each(TABLAS)("%s tiene RLS en la propia migración y se revoca a anon/authenticated", (tabla) => {
    expect(MIGRACION).toMatch(new RegExp(`ALTER TABLE ${tabla}\\s+ENABLE ROW LEVEL SECURITY`));
    const bloque = MIGRACION.slice(MIGRACION.indexOf("REVOKE ALL ON asistencia_llaves,"), MIGRACION.indexOf("REVOKE ALL ON SEQUENCE"));
    expect(bloque).toMatch(new RegExp(`\\b${tabla}\\b`));
    expect(bloque).toMatch(/FROM anon, authenticated/);
    expect(MIGRACION).toMatch(/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'anon'\)/);
  });

  it("permiso Ingesta (orden 11) con ON CONFLICT; solo rh_admin y super_admin, nunca portal_admin", () => {
    expect(SQL).toMatch(/'Ingesta', '[^']+', 11 FROM modulos m WHERE m\.nombre = 'rh' ON CONFLICT \(modulo_id, nombre\) DO NOTHING/);
    expect(SQL).toMatch(/mo\.nombre = 'Ingesta' CROSS JOIN \(VALUES \('consulta'\), \('edicion'\)\) AS t\(tipo\) WHERE r\.nombre IN \('rh_admin', 'super_admin'\) ON CONFLICT DO NOTHING/);
    expect(SQL).not.toMatch(/portal_admin/);
    expect(MIGRACION).not.toMatch(/'(creacion|eliminacion)'/);
  });

  it("no hace lo descartado: UNIQUE sobre numero_nomina, roles de BD ni cambios a otras tablas", () => {
    expect(SQL).not.toMatch(/numero_nomina/i);
    expect(SQL).not.toMatch(/CREATE (ROLE|USER)/i);
    expect(SQL).not.toMatch(/ALTER TABLE (?!asistencia_)/i);
    expect(SQL).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});

describe("Migración 013 - réplica y cableado", () => {
  it("el cuerpo de la migración está contenido en init.sql (comparación normalizada) y al final, después de la 012", () => {
    expect(normalizar(INIT)).toContain(normalizar(MIGRACION));
    expect(INIT.indexOf("013-asistencia-llaves.sql")).toBeGreaterThan(INIT.indexOf("012-asistencia.sql"));
  });

  it("el compose monta la 013 y la aplica después de la 012 y antes de la 004 final", () => {
    expect(COMPOSE).toContain("./modules/rh/backend/migrations/013-asistencia-llaves.sql:/sql/013-asistencia-llaves.sql:ro");
    const i013 = COMPOSE.indexOf("-f /sql/013-asistencia-llaves.sql");
    expect(i013).toBeGreaterThan(COMPOSE.indexOf("-f /sql/012-asistencia.sql"));
    const veces004 = [...COMPOSE.matchAll(/psql -v ON_ERROR_STOP=1 -f \/sql\/004-rls-deny-all\.sql/g)].map((m) => m.index);
    expect(veces004).toHaveLength(2);
    expect(veces004[1]).toBeGreaterThan(i013);
  });

  it("docs/supabase.md documenta la 013, las tablas y TRUST_PROXY", () => {
    expect(DOCS).toMatch(/rh\/013-asistencia-llaves\.sql/);
    expect(DOCS).toMatch(/asistencia_llaves_rechazos/);
    expect(DOCS).toMatch(/TRUST_PROXY/);
    expect(DOCS).toMatch(/operacion-ingesta\.md/);
  });
});

describe("app.js - montaje de la ingesta", () => {
  it("la ingesta se monta ANTES del parser JSON global (100 kb) y antes de /api/asistencia (authenticateJWT)", () => {
    const iIngesta = APP.indexOf('app.use("/api/asistencia/ingesta"');
    const iJson = APP.indexOf("app.use(express.json())");
    const iAsistencia = APP.indexOf('app.use("/api/asistencia", require(');
    expect(iIngesta).toBeGreaterThan(-1);
    expect(iJson).toBeGreaterThan(-1);
    expect(iIngesta).toBeLessThan(iJson);
    expect(iIngesta).toBeLessThan(iAsistencia);
    expect(APP).toMatch(/app\.use\("\/api\/asistencia\/ingesta", require\("\.\.\/\.\.\/rh\/backend\/routes\/ingesta\.routes"\)\)/);
  });

  it("el parser global sigue sin límite explícito (100 kb) y la ingesta fija el suyo de 1 MB", () => {
    expect(APP).toMatch(/app\.use\(express\.json\(\)\)/);
    expect(leer("modules/rh/backend/routes/ingesta.routes.js")).toMatch(/LIMITE_CUERPO = "1mb"/);
  });

  it("trust proxy sale de TRUST_PROXY validado (no se activa 'true' ni por omisión)", () => {
    expect(APP).toMatch(/leerTrustProxy\(process\.env\.TRUST_PROXY\)/);
    expect(APP).toMatch(/if \(trustProxy !== false\) app\.set\("trust proxy", trustProxy\)/);
    expect(APP).not.toMatch(/app\.set\("trust proxy", true\)/);
  });

  it("los compose de dev, staging y prod pasan TRUST_PROXY al backend (vacío = ninguno)", () => {
    for (const f of ["docker-compose.dev.yml", "docker-compose.staging.yml", "docker-compose.prod.yml"]) {
      expect(leer(f)).toMatch(/TRUST_PROXY: \$\{TRUST_PROXY:-\}/);
    }
    expect(leer(".env.supabase.example")).toMatch(/TRUST_PROXY/);
  });
});

describe("Archivos de la Fase 3 - sin datos reales de la red de BioTime ni llaves", () => {
  const archivos = [
    "modules/rh/backend/migrations/013-asistencia-llaves.sql",
    "modules/rh/backend/utils/marcaValidacion.js",
    "modules/rh/backend/utils/ipPermitida.js",
    "modules/rh/backend/utils/trustProxy.js",
    "modules/rh/backend/utils/llaveIngesta.js",
    "modules/rh/backend/utils/limiteTasa.js",
    "modules/rh/backend/models/llaveIngesta.model.js",
    "modules/rh/backend/models/ingesta.model.js",
    "modules/rh/backend/controllers/ingesta.controller.js",
    "modules/rh/backend/controllers/llaveIngesta.controller.js",
    "modules/rh/backend/middleware/llaveIngesta.middleware.js",
    "modules/rh/backend/services/rechazosIngesta.service.js",
    "modules/rh/backend/routes/ingesta.routes.js",
    "scripts/asistencia/simulador-marcas.js",
    "docs/asistencia/contrato-ingesta-marcas.md",
    "docs/asistencia/operacion-ingesta.md",
    "docs/asistencia/simulador-marcas.md",
    "docs/supabase.md",
  ];
  it.each(archivos)("%s no contiene IPs privadas, números de serie ni llaves reales", (archivo) => {
    const texto = leer(archivo);
    // direcciones privadas de ejemplo solo en los rangos de documentación (192.0.2.x, 198.51.100.x, 203.0.113.x)
    expect(texto).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(texto).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    expect(texto).not.toMatch(/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/);
    expect(texto).not.toMatch(/\bCN\d{8,}\b/);
    expect(texto).not.toMatch(/rhk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}/);
  });

  it("si existe docs/respuesta_intranet.md (local), ninguno de sus valores reales aparece en los archivos versionados", () => {
    const ruta = path.join(RAIZ, "docs/respuesta_intranet.md");
    if (!fs.existsSync(ruta)) return;
    const real = fs.readFileSync(ruta, "utf8");
    const ips = new Set(real.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []);
    const series = new Set(real.match(/\b[A-Z]{2,4}\d{8,}\b/g) || []);
    for (const archivo of archivos) {
      if (!fs.existsSync(path.join(RAIZ, archivo))) continue;
      const texto = leer(archivo);
      for (const valor of [...ips, ...series]) {
        if (/^(0|127)\./.test(valor)) continue;
        expect(texto).not.toContain(valor);
      }
    }
  });
});
