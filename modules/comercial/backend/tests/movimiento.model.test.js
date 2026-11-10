// Pruebas del modelo de movimientos de convenio (Fase 4): el cálculo de stock/ritmo/estimado es
// lógica pura (calcularEstado + proyectarEstimado), así que se prueba directo con listas de
// movimientos fabricadas, sin mockear Postgres para esa parte. listar()/registrar() sí van contra
// `grupo.query` mockeado, igual que convenio.model.test.js.
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));

const { grupo } = require("../../../portal/backend/config/database");
const Movimiento = require("../models/movimiento.model");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Movimiento.registrar — inserta con los 7 campos en orden", () => {
  it("manda convenio_producto_id, tipo, cantidad, fecha, orden_compra, comentario, registrado_por_id", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 1 }] });
    await Movimiento.registrar(
      5,
      { tipo: "compra_inicial", cantidad: 100, fecha_movimiento: "2026-11-01", orden_compra: "OC-123", comentario: "nota" },
      9,
    );
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO comercial_convenio_movimientos/);
    expect(params).toEqual([5, "compra_inicial", 100, "2026-11-01", "OC-123", "nota", 9]);
  });

  it("orden_compra/comentario ausentes se mandan como null, no undefined", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 1 }] });
    await Movimiento.registrar(5, { tipo: "consumo", cantidad: 10, fecha_movimiento: "2026-11-05" }, 9);
    const [, params] = grupo.query.mock.calls[0];
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });
});

describe("Movimiento.existeCompraInicial", () => {
  it("true si la consulta devuelve una fila", async () => {
    grupo.query.mockResolvedValue({ rows: [{}] });
    await expect(Movimiento.existeCompraInicial(5)).resolves.toBe(true);
  });

  it("false si no hay filas", async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    await expect(Movimiento.existeCompraInicial(5)).resolves.toBe(false);
  });
});

describe("Movimiento.calcularEstado (lógica pura sobre la lista de movimientos)", () => {
  function mockMovimientos(lista) {
    grupo.query.mockResolvedValue({ rows: lista });
  }

  it("sin ningún movimiento: stock en 0, sin compra inicial, ritmo real null", async () => {
    mockMovimientos([]);
    const estado = await Movimiento.calcularEstado(5);
    expect(estado).toMatchObject({
      tiene_compra_inicial: false,
      stock_comprado: 0,
      stock_consumido: 0,
      stock_restante: 0,
      movimientos_consumo: 0,
      ritmo_promedio_real: null,
      fecha_ultimo_movimiento: null,
    });
  });

  it("con compra inicial y 2 consumos: resta correctamente y promedia solo los consumos", async () => {
    mockMovimientos([
      { tipo: "compra_inicial", cantidad: "100", fecha_movimiento: "2026-09-01" },
      { tipo: "consumo", cantidad: "20", fecha_movimiento: "2026-10-01" },
      { tipo: "consumo", cantidad: "30", fecha_movimiento: "2026-11-01" },
    ]);
    const estado = await Movimiento.calcularEstado(5);
    expect(estado.stock_comprado).toBe(100);
    expect(estado.stock_consumido).toBe(50);
    expect(estado.stock_restante).toBe(50);
    expect(estado.movimientos_consumo).toBe(2);
    expect(estado.ritmo_promedio_real).toBe(25); // (20+30)/2, la compra inicial no cuenta
    expect(estado.fecha_ultimo_movimiento).toBe("2026-11-01");
  });

  it("cantidad viene como string de Postgres (NUMERIC): se convierte a número, no se concatena", async () => {
    mockMovimientos([
      { tipo: "compra_inicial", cantidad: "50", fecha_movimiento: "2026-09-01" },
      { tipo: "consumo", cantidad: "5", fecha_movimiento: "2026-10-01" },
    ]);
    const estado = await Movimiento.calcularEstado(5);
    expect(estado.stock_restante).toBe(45); // no "505" ni NaN
  });

  // Regresión: probado contra Postgres real (2026-11-10), fecha_movimiento llega como objeto
  // Date (no texto) porque la columna es DATE — antes esto rompía proyectarEstimado con
  // "RangeError: Invalid time value" al reconstruir `${Date}T00:00:00Z`.
  it("fecha_movimiento como objeto Date (columna DATE real de Postgres): se normaliza a texto", async () => {
    mockMovimientos([
      { tipo: "compra_inicial", cantidad: "100", fecha_movimiento: new Date("2026-11-01T00:00:00.000Z") },
      { tipo: "consumo", cantidad: "20", fecha_movimiento: new Date("2026-12-05T00:00:00.000Z") },
    ]);
    const estado = await Movimiento.calcularEstado(5);
    expect(estado.fecha_ultimo_movimiento).toBe("2026-12-05");
    expect(() => Movimiento.proyectarEstimado(estado, { cantidad_periodica: 10, periodo: "mensual" })).not.toThrow();
  });
});

describe("Movimiento.proyectarEstimado (lógica pura, sin BD)", () => {
  const lineaMensual = { cantidad_periodica: 10, periodo: "mensual" };
  const lineaUnico = { cantidad_periodica: 10, periodo: "unico" };

  it("stock ya agotado (restante <= 0): 0 periodos restantes, sin fecha", () => {
    const estado = {
      stock_restante: 0, ritmo_promedio_real: 20, fecha_ultimo_movimiento: "2026-11-01",
    };
    const r = Movimiento.proyectarEstimado(estado, lineaMensual);
    expect(r.periodos_restantes_estimados).toBe(0);
    expect(r.fecha_estimada_agotamiento).toBeNull();
  });

  it("sin ningún consumo todavía: usa cantidad_periodica del plan como respaldo (ritmo_es_real=false)", () => {
    const estado = { stock_restante: 50, ritmo_promedio_real: null, fecha_ultimo_movimiento: null };
    const r = Movimiento.proyectarEstimado(estado, lineaMensual);
    expect(r.ritmo_usado).toBe(10);
    expect(r.ritmo_es_real).toBe(false);
    expect(r.periodos_restantes_estimados).toBe(5); // 50 / 10
    expect(r.fecha_estimada_agotamiento).not.toBeNull(); // mensual sí proyecta fecha
  });

  it("con consumos reales: usa el ritmo real, no el plan (ritmo_es_real=true)", () => {
    const estado = { stock_restante: 50, ritmo_promedio_real: 25, fecha_ultimo_movimiento: "2026-11-01" };
    const r = Movimiento.proyectarEstimado(estado, lineaMensual);
    expect(r.ritmo_usado).toBe(25);
    expect(r.ritmo_es_real).toBe(true);
    expect(r.periodos_restantes_estimados).toBe(2); // 50 / 25
  });

  it("periodo 'unico' no tiene duración conocida: no proyecta fecha aunque haya ritmo", () => {
    const estado = { stock_restante: 50, ritmo_promedio_real: 10, fecha_ultimo_movimiento: "2026-11-01" };
    const r = Movimiento.proyectarEstimado(estado, lineaUnico);
    expect(r.periodos_restantes_estimados).toBe(5);
    expect(r.fecha_estimada_agotamiento).toBeNull();
  });

  it("ritmo en 0 (ni real ni plan): sin estimado, no una división entre 0", () => {
    const estado = { stock_restante: 50, ritmo_promedio_real: null, fecha_ultimo_movimiento: null };
    const r = Movimiento.proyectarEstimado(estado, { cantidad_periodica: 0, periodo: "mensual" });
    expect(r.periodos_restantes_estimados).toBeNull();
    expect(r.fecha_estimada_agotamiento).toBeNull();
  });
});
