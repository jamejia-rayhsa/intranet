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
}));
jest.mock("../config/database", () => ({ grupo: { query: jest.fn() } }));
jest.mock("../models/ticketAdjunto.model", () => ({ obtenerPorId: jest.fn() }));
jest.mock("../models/ticket.model", () => ({ obtenerPorId: jest.fn(), listar: jest.fn(), contar: jest.fn() }));
jest.mock("../controllers/adjunto.controller", () => {
  const ok = (_q, res) => res.json({ exito: true });
  return { listar: ok, subir: ok, obtenerUrl: ok, eliminar: ok };
});
jest.mock("../controllers/comentario.controller", () => {
  const ok = (_q, res) => res.json({ exito: true });
  return { listar: ok, crear: ok };
});
jest.mock("../middleware/upload.middleware", () => ({
  subirArchivo: { single: () => (_q, _r, n) => n() },
}));
jest.mock("../../../portal/backend/models/usuario.model", () => ({}));
jest.mock("../services/notificacion.service", () => ({}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn(),
}));

const { grupo } = require("../config/database");
const TicketAdjunto = require("../models/ticketAdjunto.model");
const Ticket = require("../models/ticket.model");
const { esAdminTickets, puedeAccederTicket } = require("../utils/acceso-ticket");
const ControladorTicket = require("../controllers/ticket.controller");

const app = express();
app.use(express.json());
app.use("/adjuntos", require("../routes/adjuntos.routes"));
app.use("/comentarios", require("../routes/comentarios.routes"));

const ticketDe = (solicitante_id, tecnico_id = null) => ({ solicitante_id, tecnico_id });
const usuario = (id, extra = {}) => ({ usuario_id: id, roles: ["empleado"], permisos: [], ...extra });

describe("utils/acceso-ticket", () => {
  it("esAdminTickets: mismo predicado que listar", () => {
    expect(esAdminTickets(usuario(1, { roles: ["super_admin"] }))).toBe(true);
    expect(esAdminTickets(usuario(1, { roles: ["tickets_admin"] }))).toBe(true);
    expect(esAdminTickets(usuario(1, { permisos: ["tickets.admin"] }))).toBe(true);
    expect(esAdminTickets(usuario(1, { permisos: ["tickets.technician"] }))).toBe(true);
    expect(esAdminTickets(usuario(1))).toBe(false);
    expect(esAdminTickets({ usuario_id: 1 })).toBe(false);
    expect(esAdminTickets(null)).toBe(false);
  });
  it("puedeAccederTicket: solicitante, tecnico, admin; otro no; ticket nulo no", () => {
    expect(puedeAccederTicket(usuario(1), ticketDe(1))).toBe(true);
    expect(puedeAccederTicket(usuario(2), ticketDe(1, 2))).toBe(true);
    expect(puedeAccederTicket(usuario("2"), ticketDe(1, 2))).toBe(true);
    expect(puedeAccederTicket(usuario(3), ticketDe(1, 2))).toBe(false);
    expect(puedeAccederTicket(usuario(3), null)).toBe(false);
    expect(puedeAccederTicket(usuario(3, { roles: ["tickets_admin"] }), ticketDe(1))).toBe(true);
  });
});

describe("rutas de adjuntos y comentarios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    grupo.query.mockResolvedValue({ rows: [ticketDe(1, 2)] });
    TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 9, ticket_id: 7 });
  });
  afterEach(() => jest.restoreAllMocks());

  const casos = [
    ["GET /adjuntos/7", () => request(app).get("/adjuntos/7")],
    ["GET /adjuntos/9/url", () => request(app).get("/adjuntos/9/url")],
    ["GET /comentarios/7", () => request(app).get("/comentarios/7")],
    ["POST /comentarios/7", () => request(app).post("/comentarios/7").send({ comentario: "x" })],
  ];

  describe.each(casos)("%s", (_n, llamar) => {
    it("solicitante permitido", async () => {
      mockUser = usuario(1);
      expect((await llamar()).status).toBe(200);
    });
    it("tecnico asignado permitido", async () => {
      mockUser = usuario(2);
      expect((await llamar()).status).toBe(200);
    });
    it("admin permitido sin consultar el ticket", async () => {
      mockUser = usuario(99, { roles: ["tickets_admin"] });
      expect((await llamar()).status).toBe(200);
      expect(grupo.query).not.toHaveBeenCalled();
    });
    it("otro usuario: 403 uniforme", async () => {
      mockUser = usuario(3);
      const r = await llamar();
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ exito: false, mensaje: "No tienes acceso a este recurso" });
    });
    it("ticket inexistente para no-admin: 403", async () => {
      mockUser = usuario(3);
      grupo.query.mockResolvedValue({ rows: [] });
      TicketAdjunto.obtenerPorId.mockResolvedValue(undefined);
      expect((await llamar()).status).toBe(403);
    });
  });

  it("ids no numericos: 400", async () => {
    mockUser = usuario(1);
    expect((await request(app).get("/adjuntos/abc")).status).toBe(400);
    expect((await request(app).get("/adjuntos/abc/url")).status).toBe(400);
    expect((await request(app).get("/comentarios/abc")).status).toBe(400);
  });
});

describe("ticket.controller.obtener", () => {
  function crearRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("solicitante, tecnico y admin reciben el ticket", async () => {
    Ticket.obtenerPorId.mockResolvedValue({ id: 7, ...ticketDe(1, 2) });
    for (const user of [usuario(1), usuario(2), usuario(9, { roles: ["super_admin"] })]) {
      const res = crearRes();
      await ControladorTicket.obtener({ params: { id: "7" }, user }, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
    }
  });
  it("otro usuario: 403; inexistente: 403 para no-admin y 404 para admin", async () => {
    Ticket.obtenerPorId.mockResolvedValue({ id: 7, ...ticketDe(1, 2) });
    let res = crearRes();
    await ControladorTicket.obtener({ params: { id: "7" }, user: usuario(3) }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    Ticket.obtenerPorId.mockResolvedValue(undefined);
    res = crearRes();
    await ControladorTicket.obtener({ params: { id: "8" }, user: usuario(3) }, res);
    expect(res.status).toHaveBeenCalledWith(403);

    res = crearRes();
    await ControladorTicket.obtener(
      { params: { id: "8" }, user: usuario(9, { roles: ["tickets_admin"] }) },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("escrituras: adjuntos, estado, asignar, eliminar, encuesta", () => {
  const ControladorTicket2 = require("../controllers/ticket.controller");
  let appT;
  beforeAll(() => {
    jest.doMock("../controllers/ticket.controller", () => {
      const ok = (_q, res) => res.json({ exito: true });
      return { listar: ok, listarTecnicos: ok, obtener: ok, crear: ok, actualizarEstado: ok, asignarTecnico: ok, eliminar: ok };
    });
    jest.doMock("../controllers/encuesta.controller", () => {
      const ok = (_q, res) => res.json({ exito: true });
      return { crear: ok, obtener: ok, obtenerEstadisticas: ok };
    });
    jest.isolateModules(() => {
      appT = express();
      appT.use(express.json());
      appT.use("/tickets", require("../routes/tickets.routes"));
      appT.use("/adjuntos", require("../routes/adjuntos.routes"));
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    grupo.query.mockResolvedValue({ rows: [ticketDe(1, 2)] });
    TicketAdjunto.obtenerPorId.mockResolvedValue({ id: 9, ticket_id: 7 });
  });
  afterEach(() => jest.restoreAllMocks());
  const admin = () => usuario(99, { roles: ["tickets_admin"] });

  it("POST /adjuntos/:ticketId y DELETE /adjuntos/:id: solicitante y tecnico si, otro 403, admin si", async () => {
    for (const [u, esperado] of [[usuario(1), 200], [usuario(2), 200], [usuario(3), 403], [admin(), 200]]) {
      mockUser = u;
      expect((await request(appT).post("/adjuntos/7")).status).toBe(esperado);
      expect((await request(appT).delete("/adjuntos/9")).status).toBe(esperado);
    }
  });

  it("PUT /estado: admin y tecnico asignado si; tecnico NO asignado, solicitante y otros 403", async () => {
    const put = () => request(appT).put("/tickets/7/estado").send({ estado: "resuelto" });
    mockUser = admin();
    expect((await put()).status).toBe(200);
    mockUser = usuario(2); // tecnico asignado (tecnico_id=2)
    expect((await put()).status).toBe(200);
    mockUser = usuario(5, { roles: ["tickets_tecnico"] }); // tecnico no asignado
    expect((await put()).status).toBe(403);
    mockUser = usuario(1); // solicitante
    expect((await put()).status).toBe(403);
  });

  it("PUT /asignar y DELETE /:id: solo admin", async () => {
    for (const [u, esperado] of [[admin(), 200], [usuario(2), 403], [usuario(1), 403]]) {
      mockUser = u;
      expect((await request(appT).put("/tickets/7/asignar").send({ tecnico_id: 3 })).status).toBe(esperado);
      expect((await request(appT).delete("/tickets/7")).status).toBe(esperado);
    }
  });

  it("encuesta: POST solo solicitante (ni admin ni tecnico); GET como acceso al ticket", async () => {
    const post = () => request(appT).post("/tickets/7/encuesta").send({ calificacion: 5 });
    mockUser = usuario(1);
    expect((await post()).status).toBe(200);
    mockUser = usuario(2);
    expect((await post()).status).toBe(403);
    mockUser = admin();
    expect((await post()).status).toBe(403);
    for (const [u, esperado] of [[usuario(1), 200], [usuario(2), 200], [admin(), 200], [usuario(3), 403]]) {
      mockUser = u;
      expect((await request(appT).get("/tickets/7/encuesta")).status).toBe(esperado);
    }
  });

  it("ids no numericos: 400", async () => {
    mockUser = admin();
    for (const [m, ruta] of [["put", "/tickets/x/estado"], ["put", "/tickets/x/asignar"], ["delete", "/tickets/x"], ["post", "/tickets/x/encuesta"], ["get", "/tickets/x/encuesta"], ["get", "/tickets/x"], ["post", "/adjuntos/x"], ["delete", "/adjuntos/x"]]) {
      expect((await request(appT)[m](ruta)).status).toBe(400);
    }
  });
});

describe("actualizarEstado: solo el admin puede cambiar tecnico_id por esta via", () => {
  it("tecnico asignado no reasigna con tecnico_id en el cuerpo", async () => {
    jest.resetModules();
    jest.doMock("../models/ticket.model", () => ({
      obtenerPorId: jest.fn().mockResolvedValue({ id: 7, estado: "asignado", usuario_id: 1 }),
      actualizarEstado: jest.fn().mockResolvedValue({ id: 7, estado: "resuelto" }),
    }));
    jest.doMock("../../../portal/backend/models/usuario.model", () => ({ buscarPorId: jest.fn().mockResolvedValue({ correo: "a@b" }) }));
    jest.doMock("../services/notificacion.service", () => ({ notificarCambioEstado: jest.fn() }));
    const T = require("../models/ticket.model");
    const C = jest.requireActual("../controllers/ticket.controller");
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.actualizarEstado({ params: { id: "7" }, body: { estado: "resuelto", tecnico_id: 55 }, user: usuario(2) }, res);
    expect(T.actualizarEstado).toHaveBeenCalledWith("7", "resuelto", null);
    await C.actualizarEstado({ params: { id: "7" }, body: { estado: "resuelto", tecnico_id: 55 }, user: usuario(9, { roles: ["super_admin"] }) }, res);
    expect(T.actualizarEstado).toHaveBeenLastCalledWith("7", "resuelto", 55);
  });
});
