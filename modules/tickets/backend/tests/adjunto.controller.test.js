jest.mock("../../../portal/backend/services/storage.service", () => ({
  BUCKETS: { TICKETS: "tickets-adjuntos" },
  subir: jest.fn(),
  eliminar: jest.fn(),
  urlFirmada: jest.fn(),
  claveSegura: jest.fn((n) => `seguro_${n}`),
}), { virtual: true });
jest.mock("../models/ticketAdjunto.model");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(),
}));
jest.mock("../config/database", () => ({ grupo: { query: jest.fn() } }));

const storage = require("../../../portal/backend/services/storage.service");
const TicketAdjunto = require("../models/ticketAdjunto.model");
const Controlador = require("../controllers/adjunto.controller");

function crearRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const archivo = {
  originalname: "informe.pdf",
  mimetype: "application/pdf",
  buffer: Buffer.from("x"),
};

describe("adjunto.controller (Storage)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.eliminar.mockResolvedValue();
  });

  describe("subir", () => {
    it("sube a Storage con clave ticket/archivo y guarda la clave sin /uploads", async () => {
      storage.subir.mockResolvedValue({ clave: "7/seguro_informe.pdf" });
      TicketAdjunto.crear.mockImplementation(async (d) => ({ id: 1, ...d }));
      const res = crearRes();
      await Controlador.subir({ params: { ticketId: "7" }, file: archivo }, res);

      expect(storage.subir).toHaveBeenCalledWith(
        "tickets-adjuntos", "7/seguro_informe.pdf", archivo.buffer, "application/pdf",
      );
      expect(TicketAdjunto.crear).toHaveBeenCalledWith(
        expect.objectContaining({ ruta_archivo: "7/seguro_informe.pdf", nombre_archivo: "informe.pdf" }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("si falla el INSERT limpia el objeto subido y responde 400", async () => {
      storage.subir.mockResolvedValue({});
      TicketAdjunto.crear.mockRejectedValue(new Error("bd caida"));
      const res = crearRes();
      await Controlador.subir({ params: { ticketId: "7" }, file: archivo }, res);
      expect(storage.eliminar).toHaveBeenCalledWith("tickets-adjuntos", "7/seguro_informe.pdf");
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("si falla Storage no inserta fila", async () => {
      storage.subir.mockRejectedValue(new Error("storage caido"));
      const res = crearRes();
      await Controlador.subir({ params: { ticketId: "7" }, file: archivo }, res);
      expect(TicketAdjunto.crear).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("eliminar", () => {
    it("borra objeto y fila", async () => {
      TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 3, ruta_archivo: "7/a.pdf" });
      const res = crearRes();
      await Controlador.eliminar({ params: { id: "3" } }, res);
      expect(storage.eliminar).toHaveBeenCalledWith("tickets-adjuntos", "7/a.pdf");
      expect(TicketAdjunto.eliminar).toHaveBeenCalledWith("3");
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
    });

    it("si Storage falla, avisa con warn y aun asi borra la fila", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 3, ruta_archivo: "7/a.pdf" });
      storage.eliminar.mockRejectedValue(new Error("503"));
      const res = crearRes();
      await Controlador.eliminar({ params: { id: "3" } }, res);
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0].join(" ")).not.toContain("7/a.pdf");
      expect(TicketAdjunto.eliminar).toHaveBeenCalledWith("3");
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
      warn.mockRestore();
    });

    it("fila legada: no llama a Storage y borra la fila", async () => {
      TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 4, ruta_archivo: "/uploads/tickets/x.pdf" });
      await Controlador.eliminar({ params: { id: "4" } }, crearRes());
      expect(storage.eliminar).not.toHaveBeenCalled();
      expect(TicketAdjunto.eliminar).toHaveBeenCalledWith("4");
    });
  });

  describe("obtenerUrl", () => {
    it("devuelve URL firmada de 300 s con nombre de descarga", async () => {
      TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 3, ruta_archivo: "7/a.pdf", nombre_archivo: "Informe.pdf" });
      storage.urlFirmada.mockResolvedValue("/storage/v1/object/sign/x?token=t");
      const res = crearRes();
      await Controlador.obtenerUrl({ params: { id: "3" } }, res);
      expect(storage.urlFirmada).toHaveBeenCalledWith("tickets-adjuntos", "7/a.pdf", {
        segundos: 300, descargar: "Informe.pdf",
      });
      expect(res.json).toHaveBeenCalledWith({
        exito: true,
        datos: { url: "/storage/v1/object/sign/x?token=t", nombre_archivo: "Informe.pdf", expira_en: 300 },
      });
    });

    it("fila legada -> 409 sin firmar", async () => {
      TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 4, ruta_archivo: "/uploads/tickets/x.pdf" });
      const res = crearRes();
      await Controlador.obtenerUrl({ params: { id: "4" } }, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: "Archivo pendiente de migración a Storage" });
      expect(storage.urlFirmada).not.toHaveBeenCalled();
    });

    it("adjunto inexistente -> 404", async () => {
      TicketAdjunto.obtenerPorId.mockResolvedValue(undefined);
      const res = crearRes();
      await Controlador.obtenerUrl({ params: { id: "9" } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});

describe("adjuntos.routes: autorizacion de /:id/url", () => {
  it("exige authenticateJWT y el mismo permiso de consulta que el listado", () => {
    jest.resetModules();
    const verificarPermiso = jest.fn((...args) => {
      const mw = (req, res, next) => next();
      mw.args = args;
      return mw;
    });
    jest.doMock("../../../portal/backend/middleware/permisos.middleware", () => ({ verificarPermiso }));
    jest.doMock("../../../portal/backend/middleware/auth.middleware", () => ({ authenticateJWT: function authenticateJWT() {} }));
    const router = require("../routes/adjuntos.routes");

    const capa = router.stack.find((l) => l.route && l.route.path === "/:id/url");
    expect(capa).toBeDefined();
    expect(capa.route.methods.get).toBe(true);
    expect(capa.route.stack[0].handle.args).toEqual(["tickets", "Adjuntos", "consulta"]);
    expect(router.stack[0].handle.name).toBe("authenticateJWT");
    const listar = router.stack.find((l) => l.route && l.route.path === "/:ticketId" && l.route.methods.get);
    expect(listar.route.stack[0].handle.args).toEqual(capa.route.stack[0].handle.args);
  });
});
