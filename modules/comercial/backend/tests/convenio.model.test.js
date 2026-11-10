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

describe("Convenio.crearHistorico — Fase 3 (carga histórica del CSV)", () => {
  it("inserta la cabecera con estatus/autoriza_nombre/fecha_autoriza del snapshot, autoriza_id siempre NULL y origen_historico=true", async () => {
    const cliente = { query: jest.fn().mockResolvedValue({ rows: [{ id: 42 }] }), release: jest.fn() };
    grupo.connect.mockResolvedValue(cliente);
    await Convenio.crearHistorico(
      {
        folio_origen: "27",
        cliente_codigo: "C00776",
        cliente_nombre: "Polaquimia SA DE CV",
        vendedor_codigo: "MEX10",
        vendedor_nombre: "Lizethe Maher",
        fecha_inicio: "2026-01-14",
        vigente_hasta: null,
        estatus: "cancelado",
        autoriza_nombre: "ABI",
        fecha_autoriza: "2026-01-14",
        observaciones: "Convenio histórico marcado 'No vigente' en el Excel (incremento de precios).",
        creado_por_id: 1,
      },
      [],
    );
    const [sql, params] = cliente.query.mock.calls[1]; // calls[0] es BEGIN (enTransaccion)
    expect(sql).toMatch(/INSERT INTO comercial_convenios/);
    expect(sql).toMatch(/estatus, autoriza_id, autoriza_nombre, fecha_autoriza/);
    expect(sql).toMatch(/observaciones, creado_por_id, origen_historico/);
    expect(params).toEqual([
      "27", "C00776", "Polaquimia SA DE CV", "MEX10", "Lizethe Maher",
      "2026-01-14", null, "cancelado", null, "ABI", "2026-01-14",
      "Convenio histórico marcado 'No vigente' en el Excel (incremento de precios).", 1, true,
    ]);
  });

  it("inserta cada línea de producto con insertarProducto dentro de la misma transacción", async () => {
    const cliente = { query: jest.fn().mockResolvedValue({ rows: [{ id: 42 }] }), release: jest.fn() };
    grupo.connect.mockResolvedValue(cliente);
    await Convenio.crearHistorico(
      { cliente_nombre: "X", vendedor_nombre: "Y", fecha_inicio: "2026-01-01", estatus: "autorizado", creado_por_id: 1 },
      [{ producto_descripcion: "ANSELL 39-122-08", cantidad_periodica: 144, periodo: "mensual" }],
    );
    const sqls = cliente.query.mock.calls.map(([sql]) => sql);
    expect(sqls.some((s) => s.includes("INSERT INTO comercial_convenio_productos"))).toBe(true);
  });
});

describe("Convenio.existeHistorico — idempotencia de la carga histórica", () => {
  it("consulta por folio_origen y exige origen_historico=true (R-P3-2: no colisiona con convenios de la UI)", async () => {
    await Convenio.existeHistorico("27");
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/WHERE c\.folio_origen = \$1 AND c\.origen_historico = true/);
    expect(sql).toMatch(/total_lineas/);
    expect(params).toEqual(["27"]);
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

describe("Convenio.listarConResumenConsumo — Fase 5 (dashboard): agregado sin N+1", () => {
  it("una sola consulta, sin parámetros, con el agregado por convenio y 'hoy en México' para los días", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 1 }] });
    const filas = await Convenio.listarConResumenConsumo();
    expect(grupo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = grupo.query.mock.calls[0];
    expect(params).toBeUndefined();
    expect(sql).toMatch(/America\/Mexico_City/);
    expect(sql).toMatch(/SUM\(m\.cantidad\) FILTER \(WHERE m\.tipo = 'compra_inicial'\)\s+AS stock_comprado/);
    expect(sql).toMatch(/SUM\(m\.cantidad\) FILTER \(WHERE m\.tipo = 'consumo'\)\s+AS stock_consumido/);
    expect(sql).toMatch(/AS dias_para_vencer/);
    expect(sql).toMatch(/AS dias_sin_movimiento/);
    expect(sql).toMatch(/GROUP BY p\.convenio_id/);
    expect(filas).toEqual([{ id: 1 }]);
  });
});
