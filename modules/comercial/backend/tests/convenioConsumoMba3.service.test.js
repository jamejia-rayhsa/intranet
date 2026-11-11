// Sincronización de consumo de Convenios desde MBA3: helpers puros + sincronizarRango/sincronizar
// con MBA3, movimientos y estado inyectados (sin red ni Postgres).
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));

const Servicio = require("../services/convenioConsumoMba3.service");

describe("normalizarCliente / normalizarProducto", () => {
  it("quita el sufijo de empresa de las notas de crédito y compara sin mayúsculas ni espacios", () => {
    expect(Servicio.normalizarCliente("C00255-R0001")).toBe("C00255");
    expect(Servicio.normalizarCliente(" c00255 ")).toBe("C00255");
    expect(Servicio.normalizarCliente(null)).toBe("");
    expect(Servicio.normalizarProducto(" r-144-07-00014 ")).toBe("R-144-07-00014");
  });
});

describe("cantidadFacturada (FACTURADOS de MBA3 viene siempre en 0: se usa FACTURADO + DESPACHADOS)", () => {
  it("renglón facturado con FACTURADOS=0 (caso real de MBA3) cuenta lo despachado", () => {
    expect(Servicio.cantidadFacturada({ FACTURADO: true, FACTURADOS: 0, DESPACHADOS: 50, CANT_PEDIDO: 50 })).toBe(50);
  });
  it("renglón NO facturado no cuenta aunque ya esté despachado", () => {
    expect(Servicio.cantidadFacturada({ FACTURADO: false, FACTURADOS: 0, DESPACHADOS: 50 })).toBe(0);
  });
  it("si MBA3 algún día llena FACTURADOS con la cantidad, esa tiene prioridad", () => {
    expect(Servicio.cantidadFacturada({ FACTURADO: true, FACTURADOS: 30, DESPACHADOS: 50 })).toBe(30);
  });
  it("facturado parcialmente despachado cuenta solo lo despachado, no lo pedido", () => {
    expect(Servicio.cantidadFacturada({ FACTURADO: true, FACTURADOS: 0, DESPACHADOS: 20, CANT_PEDIDO: 50 })).toBe(20);
  });
});

describe("dividirEnTrozos", () => {
  it("parte el rango en trozos de 7 días incluyendo ambos extremos", () => {
    expect(Servicio.dividirEnTrozos("2026-11-01", "2026-11-17")).toEqual([
      ["2026-11-01", "2026-11-07"],
      ["2026-11-08", "2026-11-14"],
      ["2026-11-15", "2026-11-17"],
    ]);
  });
  it("un solo día es un solo trozo", () => {
    expect(Servicio.dividirEnTrozos("2026-11-10", "2026-11-10")).toEqual([["2026-11-10", "2026-11-10"]]);
  });
  it("desde posterior a hasta no produce trozos", () => {
    expect(Servicio.dividirEnTrozos("2026-11-11", "2026-11-10")).toEqual([]);
  });
});

describe("elegirLinea", () => {
  const indice = Servicio.indexarLineas([
    { convenio_producto_id: 1, cliente_codigo: "C1", producto_codigo: "P1", fecha_base: "2026-01-01" },
    { convenio_producto_id: 2, cliente_codigo: "C1", producto_codigo: "P1", fecha_base: "2026-06-01" },
  ]);
  it("no asigna movimientos anteriores a la compra inicial", () => {
    expect(Servicio.elegirLinea(indice, "C1", "P1", "2025-12-31")).toBeNull();
  });
  it("con dos convenios del mismo cliente+producto usa el de compra inicial más reciente no posterior", () => {
    expect(Servicio.elegirLinea(indice, "C1", "P1", "2026-03-01").convenio_producto_id).toBe(1);
    expect(Servicio.elegirLinea(indice, "C1", "P1", "2026-07-01").convenio_producto_id).toBe(2);
  });
  it("cliente o producto desconocido → null", () => {
    expect(Servicio.elegirLinea(indice, "C9", "P1", "2026-07-01")).toBeNull();
  });
});

describe("sincronizarRango", () => {
  const lineas = [{ convenio_producto_id: 10, cliente_codigo: "C00255", producto_codigo: "R-144-07-00014", fecha_base: "2026-10-01" }];

  function crearMocks({ facturas = [], detalle = {}, notas = [] } = {}) {
    const mba3 = {
      paginarTodo: jest.fn(async (endpoint, body) => {
        if (endpoint === "facturas") return { data: facturas, advertencias: [] };
        if (endpoint === "pedidos-detalle") return { data: detalle[body.pedido] || [], advertencias: [] };
        if (endpoint === "notascredito") return { data: notas, advertencias: [] };
        throw new Error("endpoint inesperado " + endpoint);
      }),
    };
    const movimientos = { upsertAutomatico: jest.fn().mockResolvedValue("insertado"), eliminarAutomatico: jest.fn().mockResolvedValue(false) };
    return { mba3, movimientos };
  }

  it("consumo = FACTURADOS del renglón (no CANT_PEDIDO), con referencia PED:pedido:línea y fecha de factura", async () => {
    const { mba3, movimientos } = crearMocks({
      facturas: [{ NUMERO_PEDIDO: 500, CODIGO_CLIENTE: "C00255" }, { NUMERO_PEDIDO: 501, CODIGO_CLIENTE: "OTRO" }],
      detalle: {
        500: [
          { PEDIDO: 500, PEDIDOLINEA: 1, CLIENTE: "C00255", PRODUCTO: "R-144-07-00014", CANT_PEDIDO: 1000, FACTURADOS: 400, FECHA_FACTURA: "2026-10-12T00:00:00", FACTURA: "FE-1" },
          { PEDIDO: 500, PEDIDOLINEA: 2, CLIENTE: "C00255", PRODUCTO: "OTRO-PRODUCTO", FACTURADOS: 5, FECHA_FACTURA: "2026-10-12" },
        ],
      },
    });
    const r = await Servicio.sincronizarRango({ desde: "2026-10-10", hasta: "2026-10-14", lineas, mba3, movimientos });
    expect(movimientos.upsertAutomatico).toHaveBeenCalledTimes(1);
    expect(movimientos.upsertAutomatico).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ tipo: "consumo", cantidad: 400, fecha_movimiento: "2026-10-12", referencia_externa: "PED:500:1" }),
    );
    // Solo se consultan pedidos de clientes con convenio.
    expect(mba3.paginarTodo).not.toHaveBeenCalledWith("pedidos-detalle", { pedido: 501 });
    expect(r.consumos.insertados).toBe(1);
    expect(r.error).toBeNull();
    expect(r.ultima_fecha_completa).toBe("2026-10-14");
  });

  it("no consulta dos veces el mismo pedido aunque aparezca en varias facturas", async () => {
    const { mba3, movimientos } = crearMocks({
      facturas: [{ NUMERO_PEDIDO: 500, CODIGO_CLIENTE: "C00255" }, { NUMERO_PEDIDO: 500, CODIGO_CLIENTE: "C00255" }],
      detalle: { 500: [] },
    });
    await Servicio.sincronizarRango({ desde: "2026-10-10", hasta: "2026-10-10", lineas, mba3, movimientos });
    expect(mba3.paginarTodo.mock.calls.filter(([e]) => e === "pedidos-detalle")).toHaveLength(1);
  });

  it("FACTURADOS = 0 retira el movimiento automático previo en vez de crear uno", async () => {
    const { mba3, movimientos } = crearMocks({
      facturas: [{ NUMERO_PEDIDO: 500, CODIGO_CLIENTE: "C00255" }],
      detalle: { 500: [{ PEDIDO: 500, PEDIDOLINEA: 1, CLIENTE: "C00255", PRODUCTO: "R-144-07-00014", FACTURADOS: 0, FECHA_PEDIDO: "2026-10-11" }] },
    });
    movimientos.eliminarAutomatico.mockResolvedValue(true);
    const r = await Servicio.sincronizarRango({ desde: "2026-10-10", hasta: "2026-10-12", lineas, mba3, movimientos });
    expect(movimientos.eliminarAutomatico).toHaveBeenCalledWith(10, "PED:500:1");
    expect(movimientos.upsertAutomatico).not.toHaveBeenCalled();
    expect(r.consumos.retirados).toBe(1);
  });

  it("ignora renglones anteriores a la compra inicial de la línea", async () => {
    const { mba3, movimientos } = crearMocks({
      facturas: [{ NUMERO_PEDIDO: 500, CODIGO_CLIENTE: "C00255" }],
      detalle: { 500: [{ PEDIDO: 500, PEDIDOLINEA: 1, CLIENTE: "C00255", PRODUCTO: "R-144-07-00014", FACTURADOS: 9, FECHA_FACTURA: "2026-09-30" }] },
    });
    await Servicio.sincronizarRango({ desde: "2026-09-28", hasta: "2026-10-02", lineas, mba3, movimientos });
    expect(movimientos.upsertAutomatico).not.toHaveBeenCalled();
  });

  it("devoluciones: solo notas de crédito DEVV; cliente con sufijo de empresa; referencia NC:documento:producto", async () => {
    const { mba3, movimientos } = crearMocks({
      notas: [
        { DOCUMENTO: 1006352, DOCUMENTO_REL: "FE-1153925-R0001", CONCEPTO: "DEVV", CLIENTE_EMPRESA: "C00255-R0001", PRODUCTO: "R-144-07-00014", CANTIDAD: 1152, FECHA_CONFIRMACION: "2026-10-15T00:00:00" },
        { DOCUMENTO: 1006353, CONCEPTO: "NCAA", CLIENTE_EMPRESA: "C00255-R0001", PRODUCTO: "R-144-07-00014", CANTIDAD: 1, FECHA_CONFIRMACION: "2026-10-15T00:00:00" },
      ],
    });
    const r = await Servicio.sincronizarRango({ desde: "2026-10-12", hasta: "2026-10-18", lineas, mba3, movimientos });
    expect(movimientos.upsertAutomatico).toHaveBeenCalledTimes(1);
    expect(movimientos.upsertAutomatico).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ tipo: "devolucion", cantidad: 1152, fecha_movimiento: "2026-10-15", referencia_externa: "NC:1006352:R-144-07-00014" }),
    );
    expect(r.devoluciones.insertados).toBe(1);
  });

  it("suma renglones repetidos del mismo producto dentro de una misma nota de crédito", async () => {
    const nota = { DOCUMENTO: 7, CONCEPTO: "DEVV", CLIENTE_EMPRESA: "C00255-R0001", PRODUCTO: "R-144-07-00014", CANTIDAD: 10, FECHA_CONFIRMACION: "2026-10-15" };
    const { mba3, movimientos } = crearMocks({ notas: [nota, { ...nota, CANTIDAD: 5 }] });
    await Servicio.sincronizarRango({ desde: "2026-10-12", hasta: "2026-10-18", lineas, mba3, movimientos });
    expect(movimientos.upsertAutomatico).toHaveBeenCalledTimes(1);
    expect(movimientos.upsertAutomatico.mock.calls[0][1].cantidad).toBe(15);
  });

  it("un error de MBA3 detiene la vuelta, conserva el último trozo completo y no filtra el objeto del error", async () => {
    const { mba3, movimientos } = crearMocks();
    let llamadas = 0;
    mba3.paginarTodo.mockImplementation(async (endpoint) => {
      if (endpoint === "facturas") {
        llamadas++;
        if (llamadas === 2) throw Object.assign(new Error("MBA3: Error ejecutando la consulta"), { config: { headers: { "CF-Access-Client-Secret": "secreto" } } });
      }
      return { data: [], advertencias: [] };
    });
    const r = await Servicio.sincronizarRango({ desde: "2026-10-01", hasta: "2026-10-20", lineas, mba3, movimientos });
    expect(r.trozos_completos).toBe(1);
    expect(r.ultima_fecha_completa).toBe("2026-10-07");
    expect(r.error).toMatch(/Error ejecutando la consulta/);
    expect(JSON.stringify(r)).not.toMatch(/secreto/);
  });

  it("un resultado truncado se trata como trozo incompleto (no avanza el punto cubierto)", async () => {
    const { mba3, movimientos } = crearMocks();
    mba3.paginarTodo.mockResolvedValue({ data: [], advertencias: ["Resultado truncado: se alcanzó el tope"] });
    const r = await Servicio.sincronizarRango({ desde: "2026-10-01", hasta: "2026-10-03", lineas, mba3, movimientos });
    expect(r.ultima_fecha_completa).toBeNull();
    expect(r.error).toMatch(/truncado/);
  });
});

describe("sincronizar", () => {
  const lineas = [{ convenio_producto_id: 10, cliente_codigo: "C1", producto_codigo: "P1", fecha_base: "2026-10-01" }];
  const mba3 = { paginarTodo: jest.fn().mockResolvedValue({ data: [], advertencias: [] }) };
  const movimientos = { upsertAutomatico: jest.fn(), eliminarAutomatico: jest.fn() };

  function modelo(estado) {
    return {
      obtenerEstado: jest.fn().mockResolvedValue({ hoy_mx: "2026-10-20", ultima_fecha_cubierta: null, ...estado }),
      lineasElegibles: jest.fn().mockResolvedValue(lineas),
      contarLineasOmitidas: jest.fn().mockResolvedValue({ sin_codigo: 2, sin_compra_inicial: 1 }),
      guardarResultado: jest.fn().mockResolvedValue(),
    };
  }

  beforeEach(() => mba3.paginarTodo.mockClear());

  it("primera vez: arranca en la compra inicial más antigua y avanza el punto cubierto hasta hoy", async () => {
    const m = modelo();
    const r = await Servicio.sincronizar({ mba3, movimientos, modelo: m });
    expect(r.desde).toBe("2026-10-01");
    expect(r.hasta).toBe("2026-10-20");
    expect(r.lineas_omitidas).toEqual({ sin_codigo: 2, sin_compra_inicial: 1 });
    expect(m.guardarResultado).toHaveBeenCalledWith(expect.objectContaining({ ok: true, fechaCubierta: "2026-10-20" }));
  });

  it("vueltas siguientes: retoma con 5 días de traslape desde el punto cubierto", async () => {
    const m = modelo({ ultima_fecha_cubierta: "2026-10-18" });
    const r = await Servicio.sincronizar({ mba3, movimientos, modelo: m });
    expect(r.desde).toBe("2026-10-13");
  });

  it("`desde` manual fuerza reproceso pero el punto cubierto nunca retrocede", async () => {
    const m = modelo({ ultima_fecha_cubierta: "2026-10-30" });
    m.obtenerEstado.mockResolvedValue({ hoy_mx: "2026-11-02", ultima_fecha_cubierta: "2026-10-30" });
    mba3.paginarTodo.mockImplementation(async (endpoint, body) => {
      if (body.FECHA_INI >= "2026-10-08") throw new Error("MBA3: caído");
      return { data: [], advertencias: [] };
    });
    const r = await Servicio.sincronizar({ desde: "2026-10-01", mba3, movimientos, modelo: m });
    expect(r.desde).toBe("2026-10-01");
    expect(r.error).toMatch(/caído/);
    const llamada = m.guardarResultado.mock.calls[0][0];
    expect(llamada.ok).toBe(false);
    expect(llamada.fechaCubierta).toBeNull(); // 2026-10-07 < 2026-10-30: no retrocede
    mba3.paginarTodo.mockResolvedValue({ data: [], advertencias: [] });
  });

  it("sin líneas sincronizables no llama a MBA3 ni mueve el punto cubierto", async () => {
    const m = modelo();
    m.lineasElegibles.mockResolvedValue([]);
    const r = await Servicio.sincronizar({ mba3, movimientos, modelo: m });
    expect(r.lineas_elegibles).toBe(0);
    expect(mba3.paginarTodo).not.toHaveBeenCalled();
    expect(m.guardarResultado).toHaveBeenCalledWith(expect.objectContaining({ ok: true, fechaCubierta: null }));
  });
});
