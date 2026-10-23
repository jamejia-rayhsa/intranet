// Pruebas del modelo de Convenios enfocadas en las guardas atómicas que se movieron a SQL tras la
// revisión (R-1: "nunca lo propio" en el propio UPDATE de autorizar/rechazar; cancelar un convenio
// ya autorizado exige autoridad en el propio WHERE) y en el escape de ILIKE (R-8). `grupo.query` se
// mockea directo (sin un Postgres real: eso ya está cubierto por la prueba de integración del
// tester, documentada en code-notes.md) para inspeccionar el texto SQL y los parámetros exactos.
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));

const { grupo } = require("../../../portal/backend/config/database");
const Convenio = require("../models/convenio.model");

beforeEach(() => {
  jest.clearAllMocks();
  grupo.query.mockResolvedValue({ rows: [{ id: 1 }] });
});

describe("Convenio.autorizar — R-1: nunca lo propio en el propio UPDATE", () => {
  it("el WHERE excluye creado_por_id = autorizaId, no solo el estatus", async () => {
    await Convenio.autorizar(1, 9, "Autoriza Dor");
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/estatus = 'pendiente_autorizacion' AND creado_por_id != \$1/);
    expect(params).toEqual([9, "Autoriza Dor", 1]);
  });
});

describe("Convenio.rechazar — mismo patrón atómico que autorizar", () => {
  it("el WHERE excluye creado_por_id = autorizaId", async () => {
    await Convenio.rechazar(1, 9, "Autoriza Dor", "No cumple");
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/estatus = 'pendiente_autorizacion' AND creado_por_id != \$1/);
    expect(params).toEqual([9, "Autoriza Dor", "No cumple", 1]);
  });
});

describe("Convenio.cancelar — autoridad para cancelar un convenio ya autorizado, atómica en SQL", () => {
  it("sin autoridad, el WHERE bloquea el UPDATE si la fila real está autorizada", async () => {
    await Convenio.cancelar(1, false);
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/estatus != 'cancelado' AND \(estatus != 'autorizado' OR \$2\)/);
    expect(params).toEqual([1, false]);
  });

  it("con autoridad, el mismo WHERE permite cancelar aunque esté autorizado", async () => {
    await Convenio.cancelar(1, true);
    const [, params] = grupo.query.mock.calls[0];
    expect(params).toEqual([1, true]);
  });
});

describe("Convenio.listar — R-8: ILIKE escapado", () => {
  it("escapa %, _ y \\ del filtro antes de envolverlo en comodines", async () => {
    await Convenio.listar({ cliente_nombre: "100%_off\\" });
    const [, params] = grupo.query.mock.calls[0];
    expect(params).toEqual(["%100\\%\\_off\\\\%"]);
  });

  it("un filtro normal sigue envuelto en % sin alterarse", async () => {
    await Convenio.listar({ vendedor_nombre: "Juan" });
    const [, params] = grupo.query.mock.calls[0];
    expect(params).toEqual(["%Juan%"]);
  });
});
