// enTransaccion: ROLLBACK fallido -> la conexión se entrega rota (release(error)) y el error original se conserva.
jest.mock("../../../portal/backend/config/database", () => ({
  grupo: { query: jest.fn(), connect: jest.fn() },
}));

const { grupo } = require("../../../portal/backend/config/database");
const SolicitudVacaciones = require("../models/solicitudVacaciones.model");

function clienteFalso({ falla = {} } = {}) {
  const sqls = [];
  return {
    sqls,
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      sqls.push(sql);
      if (falla[sql]) throw falla[sql];
      return { rows: [] };
    }),
  };
}

describe("SolicitudVacaciones.enTransaccion: liberación de la conexión", () => {
  it("éxito: BEGIN, COMMIT y release sin error", async () => {
    const cliente = clienteFalso();
    grupo.connect.mockResolvedValue(cliente);
    await expect(SolicitudVacaciones.enTransaccion(async () => 7)).resolves.toBe(7);
    expect(cliente.sqls).toEqual(["BEGIN", "COMMIT"]);
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(cliente.release.mock.calls[0][0]).toBeUndefined();
  });

  it("error con ROLLBACK correcto: relanza el error y libera la conexión normalmente", async () => {
    const cliente = clienteFalso();
    grupo.connect.mockResolvedValue(cliente);
    const causa = new Error("falla de la operación");
    await expect(SolicitudVacaciones.enTransaccion(async () => { throw causa; })).rejects.toBe(causa);
    expect(cliente.sqls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(cliente.release.mock.calls[0][0]).toBeUndefined();
  });

  it("ROLLBACK fallido: release(error) para que el pool destruya la conexión, y se relanza el error ORIGINAL", async () => {
    const errorRollback = new Error("conexión rota");
    const cliente = clienteFalso({ falla: { ROLLBACK: errorRollback } });
    grupo.connect.mockResolvedValue(cliente);
    const causa = new Error("falla de la operación");
    await expect(SolicitudVacaciones.enTransaccion(async () => { throw causa; })).rejects.toBe(causa);
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(cliente.release).toHaveBeenCalledWith(errorRollback);
  });
});

describe("SolicitudVacaciones: el jefe que cuenta es el VIGENTE del empleado (JOIN con empleados)", () => {
  const sql = [];
  beforeEach(() => {
    jest.clearAllMocks();
    sql.length = 0;
    grupo.query.mockImplementation(async (texto, valores) => {
      sql.push({ texto: texto.replace(/\s+/g, " ").trim(), valores });
      return { rows: [{ count: "0" }] };
    });
  });

  it("listar y contar: el filtro 'empleado o jefe' usa empleados.jefe_inmediato_id, no el guardado en la solicitud", async () => {
    await SolicitudVacaciones.listar({ empleado_o_jefe_id: 8 });
    await SolicitudVacaciones.contar({ empleado_o_jefe_id: 8 });
    for (const { texto, valores } of sql) {
      expect(texto).toContain("LEFT JOIN empleados e ON e.id = s.empleado_id");
      expect(texto).toContain("(s.empleado_id = $1 OR e.jefe_inmediato_id = $1)");
      expect(texto).not.toContain("s.jefe_inmediato_id");
      expect(valores[0]).toBe(8);
    }
    expect(sql[0].texto).toContain("e.jefe_inmediato_id AS jefe_vigente_id");
  });

  it("listar califica las columnas ambiguas (nombre, apellido_paterno, numero_nomina, estatus, periodo) con s.", async () => {
    await SolicitudVacaciones.listar({ ver_todo: true, estatus: "pendiente", periodo: 2026, busqueda: "ana" });
    const { texto } = sql[0];
    expect(texto).toContain("s.estatus = $1");
    expect(texto).toContain("s.periodo = $2");
    expect(texto).toContain("(s.nombre ILIKE $3 OR s.apellido_paterno ILIKE $3 OR s.numero_nomina ILIKE $3)");
    expect(texto).toContain("ORDER BY s.fecha_solicitud DESC");
  });

  it("jefeVigenteDeEmpleado lee empleados.jefe_inmediato_id con el cliente recibido", async () => {
    const cliente = { query: jest.fn(async () => ({ rows: [{ jefe_inmediato_id: 9 }] })) };
    await expect(SolicitudVacaciones.jefeVigenteDeEmpleado(5, cliente)).resolves.toBe(9);
    expect(cliente.query.mock.calls[0][0]).toMatch(/FROM empleados WHERE id = \$1/);
    expect(grupo.query).not.toHaveBeenCalled();
    cliente.query.mockResolvedValue({ rows: [] });
    await expect(SolicitudVacaciones.jefeVigenteDeEmpleado(5, cliente)).resolves.toBeNull();
    await expect(SolicitudVacaciones.jefeVigenteDeEmpleado(null, cliente)).resolves.toBeNull();
  });

  it("jefeVigenteDeEmpleado bloquea la fila con FOR SHARE solo si se pide", async () => {
    const cliente = { query: jest.fn(async () => ({ rows: [{ jefe_inmediato_id: 9 }] })) };
    await SolicitudVacaciones.jefeVigenteDeEmpleado(5, cliente);
    expect(cliente.query.mock.calls[0][0]).not.toMatch(/FOR SHARE/);
    await SolicitudVacaciones.jefeVigenteDeEmpleado(5, cliente, true);
    expect(cliente.query.mock.calls[1][0]).toMatch(/WHERE id = \$1 FOR SHARE$/);
  });
});
