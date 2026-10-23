// Importación de departamentos con cupo de vacaciones y turno. La BD es un doble en memoria de lo que usa el modelo
// (departamentos, SAVEPOINT, transacción); TurnoAsignacion se simula (sus reglas SQL se prueban en turnoAsignacion.test.js
// y contra Postgres real).
const request = require("supertest");
const express = require("express");

const mockTienePermiso = jest.fn();
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => { req.user = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" }; next(); },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: (...a) => mockTienePermiso(...a),
}));
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));
jest.mock("../models/turnoAsignacion.model", () => ({ listar: jest.fn(), asignar: jest.fn(), terminar: jest.fn() }));

const { grupo } = require("../../../portal/backend/config/database");
const TurnoAsignacion = require("../models/turnoAsignacion.model");
const { ErrorAsistencia } = require("../utils/erroresAsistencia");
const { prepararFilaDepartamento } = require("../utils/importarDepartamentos");

const app = express();
app.use(express.json());
app.use("/api/departamentos", require("../routes/departamentos.routes"));

const TURNOS = [{ id: 1, nombre: "Rayhsa", activo: true }, { id: 2, nombre: "Nocturno", activo: true }, { id: 3, nombre: "Viejo", activo: false }];
const AREAS = [{ id: 10, nombre: "Administración" }];
const HOY = "2026-10-22";

function simularBd({ departamentos = [], fallaEn } = {}) {
  const estado = { departamentos: departamentos.map((d) => ({ ...d })), sig: 100, log: [], respaldo: [] };
  const cliente = {
    release: jest.fn(),
    query: jest.fn(async (sql, p = []) => {
      const q = sql.replace(/\s+/g, " ").trim();
      estado.log.push(q);
      // Como PostgreSQL: tras un error la transacción queda abortada hasta ROLLBACK [TO SAVEPOINT]
      if (/^ROLLBACK/.test(q)) estado.abortada = false;
      if (estado.abortada && !/^(ROLLBACK|COMMIT)/.test(q)) throw new Error("current transaction is aborted");
      if (fallaEn && fallaEn(q, p)) { estado.abortada = true; throw new Error("fallo simulado de PostgreSQL"); }
      if (q === "BEGIN" || q === "COMMIT" || q === "ROLLBACK") return { rows: [] };
      let m = /^SAVEPOINT (\w+)/.exec(q);
      if (m) { estado.respaldo.push([m[1], JSON.stringify(estado.departamentos)]); return { rows: [] }; }
      m = /^ROLLBACK TO SAVEPOINT (\w+)/.exec(q);
      if (m) { estado.departamentos = JSON.parse(estado.respaldo.find((r) => r[0] === m[1])[1]); return { rows: [] }; }
      if (/^RELEASE SAVEPOINT/.test(q)) return { rows: [] };
      if (/^SELECT id, nombre, descripcion, area_id, cupo_vacaciones, activo FROM departamentos/.test(q)) return { rows: estado.departamentos };
      if (/^INSERT INTO departamentos/.test(q)) {
        const d = { id: estado.sig++, nombre: p[0], descripcion: p[1], area_id: p[2], cupo_vacaciones: p[3] === null ? 1 : p[3] };
        estado.departamentos.push(d);
        return { rows: [d] };
      }
      m = /^UPDATE departamentos SET (.*) WHERE id = \$(\d+)/.exec(q);
      if (m) {
        const cols = m[1].split(",").map((c) => c.split("=")[0].trim());
        Object.assign(estado.departamentos.find((d) => d.id === p[cols.length]), Object.fromEntries(cols.map((c, i) => [c, p[i]])));
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
  grupo.connect.mockResolvedValue(cliente);
  grupo.query.mockImplementation(async (sql) => {
    if (/FROM areas/.test(sql)) return { rows: AREAS };
    if (/FROM turnos/.test(sql)) return { rows: TURNOS };
    if (/to_char\(\(now\(\)/.test(sql)) return { rows: [{ hoy: HOY }] };
    return { rows: [] };
  });
  return { estado, cliente };
}

const importar = (filas, modo, extra = {}) => request(app).post("/api/departamentos/importar").send({ filas, modo, ...extra });
const f = (i, extra = {}) => ({ _fila: i + 1, nombre: `Depto ${i}`, ...extra });
const asig = (id, turno_id, desde, hasta = null, turno_nombre = "X") => ({ id, turno_id, turno_nombre, vigente_desde: desde, vigente_hasta: hasta });

beforeEach(() => {
  jest.resetAllMocks();
  mockTienePermiso.mockResolvedValue(true);
  TurnoAsignacion.listar.mockResolvedValue([]);
  TurnoAsignacion.asignar.mockResolvedValue({});
  TurnoAsignacion.terminar.mockResolvedValue({});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("prepararFilaDepartamento", () => {
  it("nombre es obligatorio; una fecha de vigencia inválida rechaza la fila", () => {
    expect(prepararFilaDepartamento({}).error).toMatch(/nombre es requerido/);
    expect(prepararFilaDepartamento({ nombre: "a\u0000" }).error).toMatch(/caracteres no permitidos/);
    expect(prepararFilaDepartamento({ nombre: "x".repeat(101) }).error).toMatch(/excede 100/);
    expect(prepararFilaDepartamento({ nombre: "A", turno_vigente_desde: "2026-02-30" }).error).toMatch(/Turno vigente desde inválida/);
    expect(prepararFilaDepartamento(null).error).toBeTruthy();
  });

  it.each([["0"], ["abc"], ["1000"], ["-1"], ["2.5"], ["1e2"]])("cupo %p es advertencia y no se aplica", (valor) => {
    const r = prepararFilaDepartamento({ nombre: "A", cupo_vacaciones: valor });
    expect(r.fila.cupo).toBeNull();
    expect(r.advertencias).toEqual([{ campo: "cupo_vacaciones", valor_recibido: valor, motivo: "cupo inválido: debe ser un entero entre 1 y 999" }]);
  });

  it.each([["1", 1], ["999", 999], [" 15 ", 15], [7, 7]])("cupo %p -> %p", (valor, esperado) => {
    expect(prepararFilaDepartamento({ nombre: "A", cupo_vacaciones: valor }).fila.cupo).toBe(esperado);
  });

  it("turno_vigente_desde sin turno es advertencia", () => {
    expect(prepararFilaDepartamento({ nombre: "A", turno_vigente_desde: "2026-11-01" }).advertencias[0].campo).toBe("turno_vigente_desde");
  });

  it("NUL en descripción, área o turno es advertencia (nunca 500)", () => {
    const r = prepararFilaDepartamento({ nombre: "A", descripcion: "x\u0000", area: "\u0000", turno: "t\u0000" });
    expect(r.error).toBeUndefined();
    expect(r.advertencias.map((a) => a.campo)).toEqual(["descripcion", "area", "turno"]);
  });
});

describe("POST /departamentos/importar - altas y cupo", () => {
  it("crea con cupo (por omisión 1), área por nombre sin acentos y descripción", async () => {
    const bd = simularBd();
    const res = await importar([f(1, { cupo_vacaciones: "3", area: "ADMINISTRACION", descripcion: "Algo" }), f(2), f(3, { cupo_vacaciones: "0" })]);
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ insertados: 3, creados: 3, actualizados: 0, errores: [] });
    expect(bd.estado.departamentos).toMatchObject([
      { nombre: "Depto 1", cupo_vacaciones: 3, area_id: 10, descripcion: "Algo" }, { nombre: "Depto 2", cupo_vacaciones: 1 }, { nombre: "Depto 3", cupo_vacaciones: 1 },
    ]);
    expect(res.body.datos.advertencias).toEqual([{ fila: 4, nombre: "Depto 3", campo: "cupo_vacaciones", valor_recibido: "0", motivo: expect.stringMatching(/cupo inválido/) }]);
  });

  it("área inexistente: advertencia y la fila entra sin área", async () => {
    const bd = simularBd();
    const res = await importar([f(1, { area: "Marte" })]);
    expect(res.body.datos.insertados).toBe(1);
    expect(bd.estado.departamentos[0].area_id).toBeNull();
    expect(res.body.datos.advertencias[0]).toMatchObject({ campo: "area", valor_recibido: "Marte" });
  });

  it("modo omitir (por omisión): el existente es duplicado y NO se toca (ni cupo ni turno)", async () => {
    const bd = simularBd({ departamentos: [{ id: 1, nombre: "Contabilidad", descripcion: null, area_id: null, cupo_vacaciones: 1 }] });
    const res = await importar([{ _fila: 2, nombre: "CONTABILIDAD", cupo_vacaciones: "5", turno: "Rayhsa" }]);
    expect(res.body.datos).toMatchObject({ insertados: 0, duplicados: 1, duplicados_detalle: [{ fila: 2, nombre: "CONTABILIDAD", motivo: "Nombre ya existe" }] });
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(1);
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
  });

  it("modo inválido -> 400; más de 200 filas -> 400", async () => {
    simularBd();
    expect((await importar([f(1)], "borrar")).status).toBe(400);
    expect((await importar(Array.from({ length: 201 }, (_, i) => f(i)))).status).toBe(400);
  });
});

describe("POST /departamentos/importar - modo actualizar", () => {
  const existente = { id: 1, nombre: "Contabilidad", descripcion: "Vieja", area_id: 10, cupo_vacaciones: 1 };

  it("sobrescribe solo celdas con valor (cupo y descripción) y una celda vacía NUNCA borra", async () => {
    const bd = simularBd({ departamentos: [{ ...existente }] });
    const res = await importar([{ _fila: 2, nombre: "contabilidad", cupo_vacaciones: "4", descripcion: "", area: "" }], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, insertados: 0, sin_cambios: 0 });
    expect(res.body.datos.actualizados_detalle).toEqual([{ fila: 2, nombre: "contabilidad", campos: 1 }]);
    expect(bd.estado.departamentos[0]).toMatchObject({ cupo_vacaciones: 4, descripcion: "Vieja", area_id: 10 });
  });

  it("mismos valores -> sin_cambios; cupo inválido no cambia nada", async () => {
    const bd = simularBd({ departamentos: [{ ...existente }] });
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "1" }, { _fila: 3, nombre: "Contabilidad X", cupo_vacaciones: "abc" }], "actualizar");
    expect(res.body.datos).toMatchObject({ sin_cambios: 1, insertados: 1 });
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(1);
    expect(res.body.datos.advertencias.map((a) => a.campo)).toEqual(["cupo_vacaciones"]);
  });

  it("repetido en el archivo: la segunda fila del mismo departamento no se aplica", async () => {
    simularBd({ departamentos: [{ ...existente }] });
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "2" }, { _fila: 3, nombre: "contabilidad", cupo_vacaciones: "9" }], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, duplicados: 1, duplicados_detalle: [{ fila: 3, nombre: "contabilidad", motivo: "repetida en el archivo" }] });
  });
});

describe("POST /departamentos/importar - turno", () => {
  const depto = { id: 1, nombre: "Contabilidad", descripcion: null, area_id: null, cupo_vacaciones: 1 };

  it("departamento nuevo con turno: asigna desde hoy (México) por omisión, con el usuario que importa", async () => {
    simularBd();
    const res = await importar([f(1, { turno: "RAYHSA" })]);
    expect(res.body.datos).toMatchObject({ insertados: 1, turnos_asignados: 1, turnos_cambiados: 0, turnos_sin_cambio: 0 });
    expect(TurnoAsignacion.asignar).toHaveBeenCalledWith(
      "departamento", { departamento_id: 100, turno_id: 1, vigente_desde: HOY, vigente_hasta: null, creado_por: 5 }, expect.anything()
    );
    expect(TurnoAsignacion.terminar).not.toHaveBeenCalled();
  });

  it("sin asignación vigente (existente) -> asignar con la fecha del archivo; cuenta como actualizado", async () => {
    simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.listar.mockResolvedValue([asig(9, 2, "2025-01-01", "2025-12-31")]); // ya terminó
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", turno: "Nocturno", turno_vigente_desde: "2026-11-01" }], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, turnos_asignados: 1 });
    expect(TurnoAsignacion.asignar.mock.calls[0][1]).toMatchObject({ turno_id: 2, vigente_desde: "2026-11-01" });
  });

  it("mismo turno vigente -> sin cambio (no toca asignaciones)", async () => {
    simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.listar.mockResolvedValue([asig(9, 1, "2026-01-01")]);
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", turno: "rayhsa" }], "actualizar");
    expect(res.body.datos).toMatchObject({ turnos_sin_cambio: 1, sin_cambios: 1, actualizados: 0 });
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
    expect(TurnoAsignacion.terminar).not.toHaveBeenCalled();
  });

  it("turno distinto: termina la vigente el día anterior a la nueva fecha y asigna la nueva (misma transacción)", async () => {
    const bd = simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.listar.mockResolvedValue([asig(9, 1, "2026-01-01")]);
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", turno: "Nocturno", turno_vigente_desde: "2026-11-01" }], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, turnos_cambiados: 1 });
    expect(TurnoAsignacion.terminar).toHaveBeenCalledWith("departamento", 9, "2026-10-31", bd.cliente);
    expect(TurnoAsignacion.asignar.mock.calls[0][1]).toMatchObject({ turno_id: 2, vigente_desde: "2026-11-01", vigente_hasta: null });
    expect(TurnoAsignacion.asignar.mock.calls[0][2]).toBe(bd.cliente);
    expect(TurnoAsignacion.terminar.mock.invocationCallOrder[0]).toBeLessThan(TurnoAsignacion.asignar.mock.invocationCallOrder[0]);
  });

  it("el día anterior cruza mes y año (1 de enero -> 31 de diciembre)", async () => {
    simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.listar.mockResolvedValue([asig(9, 1, "2026-01-01")]);
    await importar([{ _fila: 2, nombre: "Contabilidad", turno: "Nocturno", turno_vigente_desde: "2027-01-01" }], "actualizar");
    expect(TurnoAsignacion.terminar.mock.calls[0][2]).toBe("2026-12-31");
  });

  it("fecha no posterior al inicio de la vigente -> error de ESA fila, claro, sin terminar ni asignar; el lote sigue", async () => {
    const bd = simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.listar.mockResolvedValue([asig(9, 1, "2026-10-22", null, "Rayhsa")]);
    const res = await importar([
      { _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "7", turno: "Nocturno" }, // desde hoy = inicio de la vigente
      { _fila: 3, nombre: "Otro departamento" },
    ], "actualizar");
    expect(res.body.datos.errores).toEqual([{
      fila: 2, nombre: "Contabilidad",
      error: "La fecha 2026-10-22 debe ser posterior al inicio del turno vigente (2026-10-22, Rayhsa): la vigente solo se puede terminar el día anterior",
    }]);
    expect(res.body.datos).toMatchObject({ insertados: 1, actualizados: 0 });
    expect(TurnoAsignacion.terminar).not.toHaveBeenCalled();
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(1); // el cupo de la fila con error se deshizo (SAVEPOINT)
  });

  it("traslape que detecta TurnoAsignacion (409) o la BD (23P01) -> error de la fila con mensaje seguro", async () => {
    simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.asignar.mockRejectedValueOnce(new ErrorAsistencia(409, "La vigencia se traslapa con otra asignación (2026-12-01 a sin fecha final); termínala antes o elige otras fechas"));
    let res = await importar([{ _fila: 2, nombre: "Contabilidad", turno: "Nocturno" }], "actualizar");
    expect(res.body.datos.errores[0].error).toMatch(/se traslapa con otra asignación/);
    TurnoAsignacion.asignar.mockRejectedValueOnce(Object.assign(new Error("conflicting key value violates exclusion constraint"), { code: "23P01" }));
    res = await importar([{ _fila: 2, nombre: "Contabilidad", turno: "Nocturno" }], "actualizar");
    expect(res.body.datos.errores[0].error).toBe("La vigencia del turno se traslapa con otra asignación");
    expect(JSON.stringify(res.body)).not.toMatch(/exclusion/);
  });

  it("turno inexistente o inactivo -> advertencia, el resto de la fila se aplica", async () => {
    const bd = simularBd({ departamentos: [{ ...depto }] });
    const res = await importar([
      { _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "3", turno: "No existe" },
      { _fila: 3, nombre: "Nuevo", turno: "Viejo" },
    ], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, insertados: 1, errores: [] });
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(3);
    expect(res.body.datos.advertencias.map((a) => [a.fila, a.campo, a.motivo])).toEqual([
      [2, "turno", "El turno no existe en el catálogo; no se asignó"], [3, "turno", "El turno está inactivo; no se asignó"],
    ]);
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
  });

  it("sin permiso de edición de Turnos: la columna de turno se ignora con advertencia, cupo sí se aplica", async () => {
    mockTienePermiso.mockResolvedValue(false);
    const bd = simularBd({ departamentos: [{ ...depto }] });
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "5", turno: "Rayhsa" }], "actualizar");
    expect(mockTienePermiso).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: 5 }), "rh", "Turnos", "edicion");
    expect(res.body.datos).toMatchObject({ actualizados: 1, turnos_asignados: 0 });
    expect(res.body.datos.advertencias[0]).toMatchObject({ campo: "turno", motivo: expect.stringMatching(/Sin permiso de edición de Turnos/) });
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(5);
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
  });

  it("un SQL inesperado en una fila la deshace (SAVEPOINT) con error genérico y el lote sigue", async () => {
    const bd = simularBd({ fallaEn: (q, p) => /^INSERT INTO departamentos/.test(q) && p[0] === "Depto 2" });
    const res = await importar([f(1), f(2), f(3)]);
    expect(res.body.datos).toMatchObject({ insertados: 2 });
    expect(res.body.datos.errores).toEqual([{ fila: 3, nombre: "Depto 2", error: "No se pudo guardar la fila" }]);
    expect(JSON.stringify(res.body)).not.toMatch(/PostgreSQL|fallo simulado/);
    expect(bd.estado.departamentos.map((d) => d.nombre)).toEqual(["Depto 1", "Depto 3"]);
  });

  it("falla de conexión -> 500 genérico", async () => {
    grupo.connect.mockRejectedValue(new Error("secreto"));
    grupo.query.mockResolvedValue({ rows: [{ hoy: HOY }] });
    const res = await importar([f(1)]);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
  });
});

describe("integridad de la importación de departamentos", () => {
  const depto = { id: 1, nombre: "Contabilidad", descripcion: null, area_id: null, cupo_vacaciones: 1, activo: true };

  it("M4: si un SAVEPOINT se deshace, la memoria vuelve al estado previo (la fila siguiente NO ve cambios que ya no existen)", async () => {
    const bd = simularBd({ departamentos: [{ ...depto }] });
    TurnoAsignacion.asignar.mockRejectedValueOnce(new ErrorAsistencia(409, "La vigencia se traslapa con otra asignación"));
    const res = await importar([
      { _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "5", turno: "Nocturno" }, // el turno falla: el cupo 5 se deshace
      { _fila: 3, nombre: "contabilidad", cupo_vacaciones: "5" },                     // debe escribirse (la BD sigue en 1)
    ], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, sin_cambios: 0, duplicados: 0 });
    expect(res.body.datos.errores).toHaveLength(1);
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(5);
  });

  it("M4: un alta que se deshace (el INSERT fue bien pero el turno falló) deja el nombre libre para la fila siguiente", async () => {
    const bd = simularBd();
    TurnoAsignacion.asignar.mockRejectedValueOnce(new ErrorAsistencia(409, "La vigencia se traslapa con otra asignación"));
    const res = await importar([{ _fila: 2, nombre: "Nuevo", descripcion: "uno", turno: "Rayhsa" }, { _fila: 3, nombre: "NUEVO", descripcion: "bien" }]);
    expect(res.body.datos).toMatchObject({ insertados: 1, duplicados: 0 });
    expect(res.body.datos.errores).toHaveLength(1);
    expect(bd.estado.departamentos).toHaveLength(1);
    expect(bd.estado.departamentos[0].descripcion).toBe("bien");
  });

  it("M5: nombres existentes que colapsan al normalizar (acentos/mayúsculas) -> ERROR de las filas, no se elige uno", async () => {
    const bd = simularBd({ departamentos: [
      { ...depto, id: 1, nombre: "Logística" }, { ...depto, id: 2, nombre: "LOGISTICA" }, { ...depto, id: 3, nombre: "Ventas" },
    ] });
    const antes = JSON.stringify(bd.estado.departamentos);
    for (const modo of ["omitir", "actualizar"]) {
      const res = await importar([{ _fila: 2, nombre: "logística", cupo_vacaciones: "9" }, { _fila: 3, nombre: "Ventas", cupo_vacaciones: modo === "omitir" ? "" : "4" }], modo);
      expect(res.body.datos.errores).toEqual([{ fila: 2, nombre: "logística", error: expect.stringMatching(/coincide con 2 departamentos existentes.*resuelve el duplicado/) }]);
    }
    expect(bd.estado.departamentos.map((d) => d.id === 3 ? d.cupo_vacaciones : 0)).toEqual([0, 0, 4]);
    expect(bd.estado.departamentos.slice(0, 2)).toEqual(JSON.parse(antes).slice(0, 2));
  });

  it("B2: turno a un departamento inactivo -> advertencia, no se asigna (el resto sí se aplica)", async () => {
    const bd = simularBd({ departamentos: [{ ...depto, activo: false }] });
    const res = await importar([{ _fila: 2, nombre: "Contabilidad", cupo_vacaciones: "3", turno: "Rayhsa" }], "actualizar");
    expect(res.body.datos).toMatchObject({ actualizados: 1, turnos_asignados: 0 });
    expect(res.body.datos.advertencias[0]).toMatchObject({ campo: "turno", motivo: "El departamento está inactivo; no se asignó turno" });
    expect(TurnoAsignacion.asignar).not.toHaveBeenCalled();
    expect(bd.estado.departamentos[0].cupo_vacaciones).toBe(3);
  });

  it("M1: la transacción del lote toma el candado de departamentos (4410, 2) justo después del BEGIN, antes de leer", async () => {
    const bd = simularBd({ departamentos: [{ ...depto }] });
    await importar([f(1)]);
    const llamadas = bd.cliente.query.mock.calls.map((c) => [c[0].replace(/\s+/g, " ").trim(), c[1]]);
    expect(llamadas[0][0]).toBe("BEGIN");
    expect(llamadas[1][0]).toBe("SET LOCAL lock_timeout = '3s'"); // R-3
    expect(llamadas[2][0]).toMatch(/^SELECT pg_advisory_xact_lock/);
    expect(llamadas[2][1]).toEqual([4410, 2]);
    expect(llamadas[3][0]).toMatch(/^SELECT id, nombre, descripcion/);
  });

  it("M1: el orden de escritura no depende del orden del archivo (y la primera aparición de un nombre repetido gana)", async () => {
    const filas = [f(3, { cupo_vacaciones: "3" }), f(1, { cupo_vacaciones: "1" }), f(2, { cupo_vacaciones: "2" }), f(1, { cupo_vacaciones: "9" })];
    const escritos = [];
    for (const lista of [filas, [filas[1], filas[3], filas[2], filas[0]]]) {
      const bd = simularBd();
      const res = await importar(lista);
      escritos.push(bd.estado.departamentos.map((d) => `${d.nombre}:${d.cupo_vacaciones}`));
      expect(res.body.datos.duplicados).toBe(1);
    }
    expect(escritos[0]).toEqual(["Depto 1:1", "Depto 2:2", "Depto 3:3"]);
    expect(escritos[1]).toEqual(["Depto 1:1", "Depto 2:2", "Depto 3:3"]);
  });

  it("F-IE-6: el log de una fila con error SQL no imprime la fila", async () => {
    simularBd({ fallaEn: (q) => { if (/^INSERT INTO departamentos/.test(q)) { const e = new Error("duplicate key value (SECRETO-PRIVADO)"); e.code = "23505"; e.constraint = "departamentos_nombre_key"; throw e; } return false; } });
    await importar([{ _fila: 2, nombre: "Depto Privado", descripcion: "texto privado" }]);
    const log = console.error.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(log).toMatch(/fila 2: tipo=Error código=23505 constraint=departamentos_nombre_key/);
    expect(log).not.toMatch(/SECRETO|Privado|privado/);
  });
});

describe("auditoría IMPORTAR_DEPTOS", () => {
  it("registra solo conteos (acción de ≤ 20 caracteres)", async () => {
    jest.resetModules();
    const registrarAccion = jest.fn().mockResolvedValue(null);
    jest.doMock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion }));
    jest.doMock("../../../portal/backend/middleware/permisos.middleware", () => ({ verificarPermiso: () => (_a, _b, n) => n(), tienePermiso: async () => true }));
    jest.doMock("../models/turnoAsignacion.model", () => ({ listar: async () => [], asignar: async () => ({}), terminar: async () => ({}) }));
    const C = require("../controllers/departamento.controller");
    const g = require("../../../portal/backend/config/database").grupo;
    const bd = simularBdEn(g);
    expect(bd).toBeTruthy();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.importar({ body: { filas: [f(1, { turno: "Rayhsa", cupo_vacaciones: "2" }), f(2, { cupo_vacaciones: "x" })] }, user: { usuario_id: 5 }, headers: {}, socket: {} }, res);
    const [, modulo, tabla, , accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, accion, previos]).toEqual(["rh", "departamentos", "IMPORTAR_DEPTOS", null]);
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(nuevos).toEqual({
      filas_recibidas: 2, modo: "omitir", creados: 2, actualizados: 0, sin_cambios: 0, duplicados: 0,
      turnos_asignados: 1, turnos_cambiados: 0, turnos_sin_cambio: 0, errores: 0, advertencias: 1,
    });
    expect(JSON.stringify(nuevos)).not.toMatch(/Depto/);
    jest.dontMock("../../../auditoria/backend/services/auditoria.service");
  });
});

// Misma BD en memoria, conectada a un `grupo` ya recargado
function simularBdEn(g) {
  const dep = [];
  const cliente = {
    release: () => {},
    query: async (sql, p = []) => {
      const q = sql.replace(/\s+/g, " ").trim();
      if (/^SELECT id, nombre, descripcion/.test(q)) return { rows: dep };
      if (/^INSERT INTO departamentos/.test(q)) { const d = { id: dep.length + 1, nombre: p[0], descripcion: p[1], area_id: p[2], cupo_vacaciones: p[3] || 1 }; dep.push(d); return { rows: [d] }; }
      return { rows: [] };
    },
  };
  g.connect.mockResolvedValue(cliente);
  g.query.mockImplementation(async (sql) => {
    if (/FROM areas/.test(sql)) return { rows: AREAS };
    if (/FROM turnos/.test(sql)) return { rows: TURNOS };
    if (/to_char\(\(now\(\)/.test(sql)) return { rows: [{ hoy: HOY }] };
    return { rows: [] };
  });
  return cliente;
}
