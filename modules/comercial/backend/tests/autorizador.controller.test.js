// Pruebas del controlador de la lista de autorizadores (alta/baja administrada por super_admin;
// la ruta ya exige soloSuperAdmin, ver convenios.routes.test.js — aquí solo la lógica del controlador).
jest.mock("../models/autorizador.model");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const Autorizador = require("../models/autorizador.model");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const Controlador = require("../controllers/autorizador.controller");

function crearRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ControladorAutorizador.listar", () => {
  it("devuelve la lista con los datos de usuario", async () => {
    const lista = [{ usuario_id: 9, activo: true, usuario_nombre: "Autoriza" }];
    Autorizador.listar.mockResolvedValue(lista);
    const res = crearRes();
    await Controlador.listar({}, res);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: lista });
  });
});

describe("ControladorAutorizador.agregar", () => {
  it("sin usuario_id -> 400", async () => {
    const res = crearRes();
    await Controlador.agregar({ body: {}, user: { usuario_id: 11 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Autorizador.agregar).not.toHaveBeenCalled();
  });

  it("R-2: usuario_id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.agregar({ body: { usuario_id: "abc" }, user: { usuario_id: 11 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Autorizador.agregar).not.toHaveBeenCalled();
  });

  it("usuario_id inexistente (FK) -> 400", async () => {
    const error = new Error("fk");
    error.code = "23503";
    Autorizador.agregar.mockRejectedValue(error);
    const res = crearRes();
    await Controlador.agregar({ body: { usuario_id: 999 }, user: { usuario_id: 11 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("alta correcta -> 201 y audita con el agregado_por", async () => {
    Autorizador.agregar.mockResolvedValue({ usuario_id: 10, activo: true, agregado_por_id: 11 });
    const res = crearRes();
    await Controlador.agregar({ body: { usuario_id: 10 }, user: { usuario_id: 11 } }, res);
    expect(Autorizador.agregar).toHaveBeenCalledWith(10, 11);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(registrarAccion).toHaveBeenCalled();
  });
});

describe("ControladorAutorizador.quitar", () => {
  it("R-2: usuario_id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.quitar({ params: { usuario_id: "abc" }, user: { usuario_id: 11 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Autorizador.quitar).not.toHaveBeenCalled();
  });

  it("no encontrado o ya inactivo -> 404", async () => {
    Autorizador.quitar.mockResolvedValue(undefined);
    const res = crearRes();
    await Controlador.quitar({ params: { usuario_id: "9" }, user: { usuario_id: 11 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("baja correcta -> 200 (baja lógica: activo=false) y audita", async () => {
    Autorizador.quitar.mockResolvedValue({ usuario_id: 9, activo: false });
    const res = crearRes();
    await Controlador.quitar({ params: { usuario_id: "9" }, user: { usuario_id: 11 } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(registrarAccion).toHaveBeenCalled();
  });
});
