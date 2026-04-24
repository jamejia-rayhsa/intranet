const request = require("supertest");
const express = require("express");

jest.mock("../backend/config/database", () => ({
  grupo: { query: jest.fn() },
}));

jest.mock("../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ exito: false, mensaje: "No autorizado" });
    }
    req.user = { usuario_id: 1, nombre: "Usuario Prueba" };
    next();
  },
}));

jest.mock("../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
}));

jest.mock("../backend/models/ticket.model", () => ({
  crear: jest.fn(),
  obtenerTodos: jest.fn(),
  obtenerPorId: jest.fn(),
}));

jest.mock("../../portal/backend/models/usuario.model", () => ({
  buscarPorId: jest.fn(),
}));

jest.mock("../backend/services/notificacion.service", () => ({
  notificarNuevoTicket: jest.fn(),
}));

jest.mock("../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn(),
}));

describe("Controlador de Tickets", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const ticketsRouter = require("../backend/routes/tickets.routes");
    app.use("/api/tickets", ticketsRouter);
  });

  describe("validaciones de creación", () => {
    it("debería rechazar un ticket sin título", async () => {
      const respuesta = await request(app)
        .post("/api/tickets")
        .set("Authorization", "Bearer token_prueba")
        .send({ descripcion: "Sin título", nivel_atencion: "bajo" });

      expect(respuesta.status).toBe(400);
    });

    it("debería rechazar un ticket con nivel de atención inválido", async () => {
      const respuesta = await request(app)
        .post("/api/tickets")
        .set("Authorization", "Bearer token_prueba")
        .send({ titulo: "Ticket prueba", nivel_atencion: "invalido" });

      expect(respuesta.status).toBe(400);
    });
  });

});
