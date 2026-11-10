// Pruebas de ControladorMovimiento (Fase 4: registrar/consultar movimientos de consumo). Convenio
// y Movimiento mockeados por completo, igual que convenio.controller.test.js.
jest.mock("../models/convenio.model");
jest.mock("../models/movimiento.model");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const Convenio = require("../models/convenio.model");
const Movimiento = require("../models/movimiento.model");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const Controlador = require("../controllers/movimiento.controller");

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const CONVENIO_AUTORIZADO = {
  id: 1,
  estatus: "autorizado",
  productos: [{ id: 10, cantidad_periodica: 5, periodo: "mensual" }],
};

const ESTADO_BASE = {
  tiene_compra_inicial: false, stock_comprado: 0, stock_consumido: 0, stock_restante: 0,
  movimientos_consumo: 0, ritmo_promedio_real: null, fecha_ultimo_movimiento: null, movimientos: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  Movimiento.ERROR_UNICIDAD = "23505";
  Movimiento.calcularEstado.mockResolvedValue(ESTADO_BASE);
  Movimiento.proyectarEstimado.mockImplementation((estado) => ({
    ...estado, ritmo_usado: 0, ritmo_es_real: false, periodos_restantes_estimados: null, fecha_estimada_agotamiento: null,
  }));
});

describe("ControladorMovimiento.listar", () => {
  it("400 con un id inválido", async () => {
    const res = crearRes();
    await Controlador.listar({ params: { id: "abc", productoId: "10" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 si el convenio no existe", async () => {
    Convenio.obtener.mockResolvedValue(null);
    const res = crearRes();
    await Controlador.listar({ params: { id: "1", productoId: "10" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("404 si la línea de producto no pertenece a ese convenio (defensa contra IDOR)", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.listar({ params: { id: "1", productoId: "999" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 con el estado calculado", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.listar({ params: { id: "1", productoId: "10" } }, res);
    expect(Movimiento.calcularEstado).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
  });
});

describe("ControladorMovimiento.registrar", () => {
  const body = { tipo: "compra_inicial", cantidad: 100, fecha_movimiento: "2026-11-01" };
  function req(overrides = {}) {
    return { params: { id: "1", productoId: "10" }, body: { ...body, ...overrides }, user: { usuario_id: 9 } };
  }

  it("409 si el convenio no está autorizado", async () => {
    Convenio.obtener.mockResolvedValue({ ...CONVENIO_AUTORIZADO, estatus: "pendiente_autorizacion" });
    const res = crearRes();
    await Controlador.registrar(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("400 con tipo inválido", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.registrar(req({ tipo: "otra-cosa" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400 con cantidad <= 0", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.registrar(req({ cantidad: 0 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400 con fecha_movimiento inválida", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.registrar(req({ fecha_movimiento: "31/11/2026" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("409 al registrar consumo sin compra inicial previa", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    Movimiento.existeCompraInicial.mockResolvedValue(false);
    const res = crearRes();
    await Controlador.registrar(req({ tipo: "consumo", cantidad: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(Movimiento.registrar).not.toHaveBeenCalled();
  });

  it("409 si ya existe una compra inicial (violación de unicidad de la BD)", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const errorUnico = new Error("duplicate key");
    errorUnico.code = "23505";
    Movimiento.registrar.mockRejectedValue(errorUnico);
    const res = crearRes();
    await Controlador.registrar(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("201 y auditoría al registrar una compra inicial válida", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    Movimiento.registrar.mockResolvedValue({ id: 5, tipo: "compra_inicial", cantidad: 100 });
    const res = crearRes();
    await Controlador.registrar(req(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("201 al registrar consumo cuando sí hay compra inicial", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    Movimiento.existeCompraInicial.mockResolvedValue(true);
    Movimiento.registrar.mockResolvedValue({ id: 6, tipo: "consumo", cantidad: 10 });
    const res = crearRes();
    await Controlador.registrar(req({ tipo: "consumo", cantidad: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("ControladorMovimiento.estadoConvenio", () => {
  it("404 si el convenio no existe", async () => {
    Convenio.obtener.mockResolvedValue(null);
    const res = crearRes();
    await Controlador.estadoConvenio({ params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 con una línea por producto del convenio", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_AUTORIZADO);
    const res = crearRes();
    await Controlador.estadoConvenio({ params: { id: "1" } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      exito: true,
      datos: expect.objectContaining({ lineas: expect.arrayContaining([expect.objectContaining({ producto_id: 10 })]) }),
    }));
  });
});
