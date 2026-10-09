const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn(),
}));
jest.mock("../models/empleado.model", () => ({ obtenerPorUsuarioId: jest.fn() }));
jest.mock("../models/reciboNomina.model", () => ({ obtenerPorId: jest.fn() }));
jest.mock("../models/expedienteDocumento.model", () => ({ obtenerPorId: jest.fn() }));
jest.mock("../controllers/reciboNomina.controller", () => {
  const ok = (req, res) => res.json({ exito: true });
  return { listar: ok, listarPorPeriodo: ok, obtener: ok, obtenerUrl: ok, crear: ok, eliminar: ok };
});
jest.mock("../controllers/expediente.controller", () => {
  const ok = (req, res) => res.json({ exito: true });
  return { listar: ok, obtenerUrl: ok, subir: ok, eliminar: ok };
});
jest.mock("../middleware/upload.middleware", () => ({
  subirArchivo: { single: () => (_q, _r, n) => n() },
  subirDocumentoExpediente: { single: () => (_q, _r, n) => n() },
}));

const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Empleado = require("../models/empleado.model");
const Recibo = require("../models/reciboNomina.model");
const Doc = require("../models/expedienteDocumento.model");

const app = express();
app.use("/recibos", require("../routes/recibos.routes"));
app.use("/expediente", require("../routes/expediente.routes"));

const DENEGADO = { exito: false, mensaje: "No tienes acceso a este recurso" };

// RH = permiso de edicion (o super_admin; tienePermiso lo resuelve)
function comoEmpleado(empleadoId) {
  mockUser = { usuario_id: 10, rol_id: 3, rol_nombre: "rh_empleado" };
  tienePermiso.mockResolvedValue(false);
  Empleado.obtenerPorUsuarioId.mockResolvedValue(empleadoId ? { id: empleadoId } : undefined);
}
function comoRH() {
  mockUser = { usuario_id: 20, rol_id: 2, rol_nombre: "rh_admin" };
  tienePermiso.mockResolvedValue(true);
}

describe("acceso por propietario (RH)", () => {
  let warn;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe("recibos", () => {
    it("duenio ve sus recibos", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/recibos/empleado/5")).status).toBe(200);
    });
    it("duenio NO ve recibos de otro empleado (403 uniforme)", async () => {
      comoEmpleado(5);
      const r = await request(app).get("/recibos/empleado/6");
      expect(r.status).toBe(403);
      expect(r.body).toEqual(DENEGADO);
    });
    it("usuario sin empleado vinculado: 403", async () => {
      comoEmpleado(null);
      expect((await request(app).get("/recibos/empleado/5")).status).toBe(403);
    });
    it("RH (edicion) y super_admin ven cualquier empleado", async () => {
      comoRH();
      expect((await request(app).get("/recibos/empleado/6")).status).toBe(200);
      expect(Empleado.obtenerPorUsuarioId).not.toHaveBeenCalled();
    });
    it("GET /:id y /:id/url: duenio del recibo permitido, ajeno 403", async () => {
      comoEmpleado(5);
      Recibo.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 5 });
      expect((await request(app).get("/recibos/1")).status).toBe(200);
      expect((await request(app).get("/recibos/1/url")).status).toBe(200);
      Recibo.obtenerPorId.mockResolvedValue({ id: 2, empleado_id: 6 });
      expect((await request(app).get("/recibos/2")).status).toBe(403);
      expect((await request(app).get("/recibos/2/url")).status).toBe(403);
    });
    it("recibo inexistente: 403 para no-RH", async () => {
      comoEmpleado(5);
      Recibo.obtenerPorId.mockResolvedValue(undefined);
      expect((await request(app).get("/recibos/999")).status).toBe(403);
    });
    it("recibo inexistente: RH pasa al controlador (que responde 404)", async () => {
      comoRH();
      expect((await request(app).get("/recibos/999")).status).toBe(200);
      expect(Recibo.obtenerPorId).not.toHaveBeenCalled();
    });
    it("periodo solo RH", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/recibos/periodo/2026-05")).status).toBe(403);
      comoRH();
      expect((await request(app).get("/recibos/periodo/2026-05")).status).toBe(200);
    });
    it("ids y periodo invalidos: 400", async () => {
      comoRH();
      expect((await request(app).get("/recibos/empleado/abc")).status).toBe(400);
      expect((await request(app).get("/recibos/abc")).status).toBe(400);
      expect((await request(app).get("/recibos/abc/url")).status).toBe(400);
      expect((await request(app).get("/recibos/periodo/2026-5")).status).toBe(400);
      expect((await request(app).get("/recibos/periodo/hola")).status).toBe(400);
    });
    it("error de BD: 500", async () => {
      comoEmpleado(5);
      Empleado.obtenerPorUsuarioId.mockRejectedValue(new Error("db"));
      const err = jest.spyOn(console, "error").mockImplementation(() => {});
      expect((await request(app).get("/recibos/empleado/5")).status).toBe(500);
      err.mockRestore();
    });
    it("escritura sigue en manos de verificarPermiso edicion (no pasa por propietario)", async () => {
      comoEmpleado(5);
      expect((await request(app).delete("/recibos/1")).status).toBe(200);
    });
  });

  describe("expediente", () => {
    it("duenio ve su expediente; ajeno 403; RH ve todo", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/expediente/5")).status).toBe(200);
      expect((await request(app).get("/expediente/6")).status).toBe(403);
      comoRH();
      expect((await request(app).get("/expediente/6")).status).toBe(200);
    });
    it("/:id/url resuelve el empleado del documento", async () => {
      comoEmpleado(5);
      Doc.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 5 });
      expect((await request(app).get("/expediente/1/url")).status).toBe(200);
      Doc.obtenerPorId.mockResolvedValue({ id: 2, empleado_id: 6 });
      expect((await request(app).get("/expediente/2/url")).status).toBe(403);
      Doc.obtenerPorId.mockResolvedValue(undefined);
      expect((await request(app).get("/expediente/3/url")).status).toBe(403);
    });
    it("sin empleado vinculado: 403; ids invalidos: 400", async () => {
      comoEmpleado(null);
      expect((await request(app).get("/expediente/5")).status).toBe(403);
      expect((await request(app).get("/expediente/x")).status).toBe(400);
      expect((await request(app).get("/expediente/x/url")).status).toBe(400);
    });
    it("el aviso de denegado no incluye datos sensibles", async () => {
      comoEmpleado(5);
      await request(app).get("/expediente/6");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/usuario_id=10 recurso=rh\.Expedientes:6/);
    });
  });
});
