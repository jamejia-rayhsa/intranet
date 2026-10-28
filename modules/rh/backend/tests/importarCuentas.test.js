// Columna "Correo de la cuenta" de la importación de empleados: vincula la cuenta (usuarios.correo) al empleado identificado
// por CURP o nómina. Solo escribe empleados.usuario_id. Datos 100% ficticios (@ejemplo.test).
const { crearBd } = require("./fakeEmpleadosImportacion");

jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));
const { grupo } = require("../../../portal/backend/config/database");
const Empleado = require("../models/empleado.model");
const { prepararFilaEmpleado } = require("../utils/importarEmpleados");

const CURP = (n) => `XXXX0001010000${String(n).padStart(4, "0")}`;
const fila = (i, extra = {}) => ({ _fila: i + 1, nombre: `Ana${i}`, apellido_paterno: "Prueba", curp: CURP(i), ...extra });
const USUARIOS = [
  { id: 1, correo: "ana1@ejemplo.test" },
  { id: 2, correo: "ana2@ejemplo.test" },
  { id: 3, correo: "inactiva@ejemplo.test", activo: false },
  { id: 4, correo: "sinrol@ejemplo.test", con_acceso_asistencia: false },
  { id: 5, correo: "admin@ejemplo.test", roles: ["rh_admin"] },
  { id: 6, correo: "otra@ejemplo.test" },
];

function simular(empleados = [], usuarios = USUARIOS) {
  const bd = crearBd({ empleados, usuarios });
  grupo.query.mockImplementation(bd.query);
  grupo.connect.mockImplementation(bd.connect);
  return bd;
}
const importar = (filas, modo = "actualizar") => Empleado.importarLote(filas, {}, { modo });
const emp = (id, extra = {}) => ({ id, nombre: `Ana${id}`, apellido_paterno: "Prueba", curp: CURP(id), usuario_id: null, estatus: "activo", ...extra });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("validación de la columna Correo de la cuenta", () => {
  it("lo guarda en minúsculas y sin espacios alrededor", () => {
    const { fila: f } = prepararFilaEmpleado({ nombre: "A", apellido_paterno: "B", correo_cuenta: "  Ana1@Ejemplo.TEST " });
    expect(f.correo_cuenta).toBe("ana1@ejemplo.test");
  });
  it("un formato inválido es advertencia por campo y no se vincula", () => {
    const { fila: f, advertencias } = prepararFilaEmpleado({ nombre: "A", apellido_paterno: "B", correo_cuenta: "no es correo" });
    expect(f.correo_cuenta).toBe("");
    expect(advertencias.find((a) => a.campo === "correo_cuenta")).toBeTruthy();
  });
  it("celda vacía: sin cuenta y sin advertencia", () => {
    const r = prepararFilaEmpleado({ nombre: "A", apellido_paterno: "B", correo_cuenta: "" });
    expect(r.fila.correo_cuenta).toBe("");
    expect(r.advertencias).toHaveLength(0);
  });
});

describe("importarLote con correo_cuenta", () => {
  it("modo actualizar: vincula la cuenta (sin distinguir mayúsculas) al empleado identificado por CURP", async () => {
    const bd = simular([emp(1)]);
    const r = await importar([fila(1, { correo_cuenta: "ANA1@ejemplo.test" })]);
    expect(r.errores).toEqual([]);
    expect(r.cuentas_vinculadas).toBe(1);
    expect(r.actualizados).toBe(1);
    expect(bd.estado.empleados[0].usuario_id).toBe(1);
  });

  it("modo actualizar: se identifica también por número de nómina", async () => {
    const bd = simular([emp(1, { curp: null, numero_nomina: "N-1" })]);
    const r = await importar([{ _fila: 2, nombre: "Ana1", apellido_paterno: "Prueba", numero_nomina: "N-1", correo_cuenta: "ana1@ejemplo.test" }]);
    expect(r.cuentas_vinculadas).toBe(1);
    expect(bd.estado.empleados[0].usuario_id).toBe(1);
  });

  it("modo omitir: vincula al CREAR el empleado; en uno que ya existe (duplicado) no toca nada", async () => {
    const bd = simular([emp(1)]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" }), fila(2, { correo_cuenta: "ana2@ejemplo.test" })], "omitir");
    expect(r.duplicados).toBe(1);
    expect(r.insertados).toBe(1);
    expect(r.cuentas_vinculadas).toBe(1);
    expect(bd.estado.empleados.find((e) => e.id === 1).usuario_id).toBeNull();
    expect(bd.estado.empleados.find((e) => e.curp === CURP(2)).usuario_id).toBe(2);
  });

  it("no existe una cuenta con ese correo: error de la fila y no se guarda nada de ella", async () => {
    const bd = simular([emp(1)]);
    const r = await importar([fila(1, { correo_cuenta: "nadie@ejemplo.test", calle: "Calle Nueva" })]);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].error).toMatch(/No existe una cuenta/);
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
    expect(bd.estado.empleados[0].calle).toBeUndefined();
  });

  it("la cuenta ya vinculada a OTRO empleado: error y el vínculo original queda intacto", async () => {
    const bd = simular([emp(1), emp(2, { usuario_id: 1 })]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.errores[0].error).toMatch(/OTRO empleado/);
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
    expect(bd.estado.empleados[1].usuario_id).toBe(1);
  });

  it("el empleado ya tiene otra cuenta: error y no se pisa", async () => {
    const bd = simular([emp(1, { usuario_id: 6 })]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.errores[0].error).toMatch(/ya tiene otra cuenta/);
    expect(bd.estado.empleados[0].usuario_id).toBe(6);
  });

  it("la misma cuenta ya vinculada al mismo empleado: sin cambios, sin error (idempotente)", async () => {
    const bd = simular([emp(1, { usuario_id: 1 })]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.errores).toEqual([]);
    expect(r.sin_cambios).toBe(1);
    expect(r.cuentas_vinculadas).toBe(0);
    expect(bd.estado.empleados[0].usuario_id).toBe(1);
  });

  it("una cuenta vinculada a un empleado con rol privilegiado ya existente no se reporta al reimportar (no cambia)", async () => {
    simular([emp(1, { usuario_id: 5 })]);
    const r = await importar([fila(1, { correo_cuenta: "admin@ejemplo.test" })]);
    expect(r.errores).toEqual([]);
  });

  it("cuenta con rol privilegiado: error (se vincula desde la pantalla con confirmación aparte)", async () => {
    const bd = simular([emp(1)]);
    const r = await importar([fila(1, { correo_cuenta: "admin@ejemplo.test" })]);
    expect(r.errores[0].error).toMatch(/privilegiado/);
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
  });

  it("empleado dado de baja: no se vincula", async () => {
    const bd = simular([emp(1, { estatus: "baja" })]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.errores[0].error).toMatch(/baja/);
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
  });

  it("cuenta inactiva o sin rol de asistencia: se vincula con advertencia", async () => {
    const bd = simular([emp(1), emp(2)]);
    const r = await importar([fila(1, { correo_cuenta: "inactiva@ejemplo.test" }), fila(2, { correo_cuenta: "sinrol@ejemplo.test" })]);
    expect(r.errores).toEqual([]);
    expect(r.cuentas_vinculadas).toBe(2);
    expect(r.advertencias.map((a) => a.motivo).join("|")).toMatch(/inactiva/);
    expect(r.advertencias.map((a) => a.motivo).join("|")).toMatch(/Asistencia/);
    expect(bd.estado.empleados.map((e) => e.usuario_id)).toEqual([3, 4]);
  });

  it("dos filas del mismo archivo con la misma cuenta: solo la primera vincula", async () => {
    const bd = simular([emp(1), emp(2)]);
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" }), fila(2, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.cuentas_vinculadas).toBe(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].error).toMatch(/OTRO empleado/);
    expect(bd.estado.empleados.filter((e) => e.usuario_id === 1)).toHaveLength(1);
  });

  it("celda vacía no desvincula ni pisa un vínculo existente", async () => {
    const bd = simular([emp(1, { usuario_id: 1 })]);
    const r = await importar([fila(1, { correo_cuenta: "", calle: "Calle 9" })]);
    expect(r.errores).toEqual([]);
    expect(bd.estado.empleados[0].usuario_id).toBe(1);
  });

  it("la condición de carrera (UNIQUE) se reporta como error de la fila sin texto de PostgreSQL", async () => {
    // el empleado 2 toma la cuenta 1 entre la lectura y la escritura
    const bd = simular([emp(1), emp(2)]);
    const original = bd.estado.empleados;
    grupo.connect.mockImplementation(async () => {
      const c = await bd.connect();
      const q = c.query;
      c.query = async (sql, params) => {
        if (/^UPDATE empleados SET usuario_id/.test(sql.replace(/\s+/g, " ")) ) original.find((e) => e.id === 2).usuario_id = 1;
        return q(sql, params);
      };
      return c;
    });
    const r = await importar([fila(1, { correo_cuenta: "ana1@ejemplo.test" })]);
    expect(r.errores).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/duplicate key|detalle interno|23505/);
  });
});
