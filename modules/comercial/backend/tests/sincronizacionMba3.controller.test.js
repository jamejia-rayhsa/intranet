jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));
jest.mock("../models/sincronizacionMba3.model", () => ({ obtenerEstado: jest.fn() }));
jest.mock("../services/convenioConsumoMba3.service", () => ({ sincronizarConCandado: jest.fn() }));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion: jest.fn().mockResolvedValue() }));

const Modelo = require("../models/sincronizacionMba3.model");
const Servicio = require("../services/convenioConsumoMba3.service");
const Controlador = require("../controllers/sincronizacionMba3.controller");

function crearRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe("sincronizacionMba3.controller.estado", () => {
  it("devuelve el estado de la última sincronización", async () => {
    Modelo.obtenerEstado.mockResolvedValue({ ultima_fecha_cubierta: "2026-11-10", ultima_ejecucion_ok: "x", ultimo_resultado: { a: 1 } });
    const res = crearRes();
    await Controlador.estado({}, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ exito: true, datos: expect.objectContaining({ ultima_fecha_cubierta: "2026-11-10", en_curso: false }) }),
    );
  });
  it("error de BD → 500 con formato { exito:false, mensaje }", async () => {
    Modelo.obtenerEstado.mockRejectedValue(new Error("bd"));
    const res = crearRes();
    await Controlador.estado({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sincronizacionMba3.controller.ejecutar", () => {
  it("rechaza una fecha `desde` inválida con 400", async () => {
    const res = crearRes();
    await Controlador.ejecutar({ body: { desde: "2026-13-45" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Servicio.sincronizarConCandado).not.toHaveBeenCalled();
  });

  it("inicia en segundo plano y responde 202; una segunda petición mientras corre recibe 409", async () => {
    let terminar;
    Servicio.sincronizarConCandado.mockReturnValue(new Promise((r) => (terminar = r)));
    const res1 = crearRes();
    await Controlador.ejecutar({ body: { desde: "2026-10-01" } }, res1);
    expect(res1.status).toHaveBeenCalledWith(202);
    expect(Servicio.sincronizarConCandado).toHaveBeenCalledWith({ desde: "2026-10-01" });

    const res2 = crearRes();
    await Controlador.ejecutar({ body: {} }, res2);
    expect(res2.status).toHaveBeenCalledWith(409);

    terminar({});
    await new Promise((r) => setImmediate(r));
    const res3 = crearRes();
    Servicio.sincronizarConCandado.mockResolvedValue({});
    await Controlador.ejecutar({ body: {} }, res3);
    expect(res3.status).toHaveBeenCalledWith(202);
  });
});
