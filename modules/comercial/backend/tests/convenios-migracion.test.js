// Pruebas por lectura de archivos (mismo patrón que modules/rh/backend/tests/calendario-migracion.test.js):
// la migración 002 de convenios es idempotente, define las reglas de negocio esperadas y está
// replicada exactamente en init.sql (para instalaciones nuevas) y montada en app.js.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const MIGRACION = leer("modules/comercial/backend/migrations/002-convenios-compra.sql");
const INIT = leer("config/database/init.sql");
const APP_JS = leer("modules/portal/backend/app.js");

describe("Migración 002 convenios de compra", () => {
  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s crea las 3 tablas de forma idempotente (IF NOT EXISTS)", (_n, sql) => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_convenios/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_convenio_productos/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comercial_autorizadores/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s define el estatus con los 4 valores y sin 'vencido' guardado", (_n, sql) => {
    expect(sql).toMatch(
      /estatus[\s\S]*?CHECK[\s\S]*?IN \('pendiente_autorizacion', 'autorizado', 'rechazado', 'cancelado'\)/,
    );
    expect(sql).not.toMatch(/'vencido'/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s exige vigente_hasta >= fecha_inicio cuando no es abierta", (_n, sql) => {
    expect(sql).toMatch(/CHECK \(vigente_hasta IS NULL OR vigente_hasta >= fecha_inicio\)/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s borra las líneas al borrar la cabecera (ON DELETE CASCADE)", (_n, sql) => {
    expect(sql).toMatch(/convenio_id INT NOT NULL REFERENCES comercial_convenios\(id\) ON DELETE CASCADE/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s no tiene CHECK de 'periodo' en BD (se valida en el backend)", (_n, sql) => {
    const bloqueProductos = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS comercial_convenio_productos"),
      sql.indexOf("CREATE TABLE IF NOT EXISTS comercial_convenio_productos") + 700,
    );
    expect(bloqueProductos).toMatch(/periodo TEXT NOT NULL/);
    expect(bloqueProductos).not.toMatch(/periodo[\s\S]*CHECK/);
  });

  it.each([
    ["la migración", MIGRACION],
    ["init.sql", INIT],
  ])("%s otorga 'Convenios' (consulta+edición) a super_admin, portal_admin y comercial_admin", (_n, sql) => {
    expect(sql).toMatch(/'Convenios'/);
    expect(sql).toMatch(
      /WHERE r\.nombre IN \('super_admin', 'portal_admin', 'comercial_admin'\)/,
    );
  });

  it("la lista de autorizadores es administrable (usuario_id único, activo, quién y cuándo la agregó)", () => {
    expect(MIGRACION).toMatch(/usuario_id INT PRIMARY KEY REFERENCES usuarios\(id\)/);
    expect(MIGRACION).toMatch(/activo BOOLEAN NOT NULL DEFAULT true/);
    expect(MIGRACION).toMatch(/agregado_por_id INT NOT NULL REFERENCES usuarios\(id\)/);
  });

  it("app.js monta las rutas de convenios bajo /api/comercial", () => {
    expect(APP_JS).toMatch(/app\.use\('\/api\/comercial', require\('..\/..\/comercial\/backend\/routes\/convenios\.routes'\)\)/);
  });
});
