jest.mock("../models/ticketEncuesta.model");
jest.mock("../models/ticket.model");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(),
}));
jest.mock("../config/database", () => ({ grupo: { query: jest.fn() } }));

const TicketEncuesta = require("../models/ticketEncuesta.model");
const Ticket = require("../models/ticket.model");
const Controlador = require("../controllers/encuesta.controller");

function crearRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const pedir = (body) => ({ params: { ticketId: "7" }, body, user: { usuario_id: 1 } });

describe("encuesta.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ticket.obtenerPorId.mockResolvedValue({ id: 7, estado: "resuelto" });
    TicketEncuesta.crear.mockImplementation(async (d) => ({ id: 3, ...d }));
  });

  describe("crear", () => {
    it.each([[4.5], [0], [6], ["5"], [undefined]])("rechaza la calificación %p", async (calificacion) => {
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(TicketEncuesta.crear).not.toHaveBeenCalled();
    });

    it("rechaza comentarios de más de 1000 caracteres", async () => {
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion: 5, comentarios: "x".repeat(1001) }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it.each([["abierto"], ["en_progreso"]])("no acepta encuestas con el ticket %s", async (estado) => {
      Ticket.obtenerPorId.mockResolvedValue({ id: 7, estado });
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion: 5 }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(TicketEncuesta.crear).not.toHaveBeenCalled();
    });

    it.each([["resuelto"], ["cerrado"]])("acepta encuestas con el ticket %s", async (estado) => {
      Ticket.obtenerPorId.mockResolvedValue({ id: 7, estado });
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion: 4, comentarios: "  Bien  " }), res);
      expect(TicketEncuesta.crear).toHaveBeenCalledWith({
        ticket_id: "7", calificacion: 4, comentarios: "Bien",
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("responde 404 si el ticket no existe", async () => {
      Ticket.obtenerPorId.mockResolvedValue(undefined);
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion: 5 }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("responde 409 si el ticket ya tenía encuesta (envío simultáneo)", async () => {
      TicketEncuesta.crear.mockResolvedValue(null);
      const res = crearRes();
      await Controlador.crear(pedir({ calificacion: 5 }), res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe("obtenerEstadisticas", () => {
    const resumen = { total_encuestas: 2, promedio: "4.50" };
    beforeEach(() => {
      TicketEncuesta.obtenerEstadisticas.mockResolvedValue(resumen);
      TicketEncuesta.porTecnico.mockResolvedValue([{ tecnico: "A" }]);
      TicketEncuesta.porCategoria.mockResolvedValue([{ categoria: "Red" }]);
      TicketEncuesta.comentariosRecientes.mockResolvedValue([{ id: 1 }]);
    });
    const estad = (user, query = {}) => ({ user, query });

    it("el administrador ve el ranking, las categorías y los comentarios", async () => {
      const res = crearRes();
      await Controlador.obtenerEstadisticas(estad({ usuario_id: 1, roles: ["tickets_admin"] }), res);
      const { datos } = res.json.mock.calls[0][0];
      expect(datos.alcance).toBe("global");
      expect(datos.por_tecnico).toHaveLength(1);
      expect(datos.comentarios).toHaveLength(1);
    });

    it("el técnico solo ve sus propios tickets y no el ranking", async () => {
      const res = crearRes();
      await Controlador.obtenerEstadisticas(
        estad({ usuario_id: 9, roles: [], permisos: ["tickets.technician"] }), res,
      );
      const { datos } = res.json.mock.calls[0][0];
      expect(TicketEncuesta.obtenerEstadisticas).toHaveBeenCalledWith(expect.objectContaining({ tecnicoId: 9 }));
      expect(datos.alcance).toBe("propio");
      expect(datos.por_tecnico).toEqual([]);
    });

    it("otro rol con consulta solo recibe el resumen", async () => {
      const res = crearRes();
      await Controlador.obtenerEstadisticas(estad({ usuario_id: 5, roles: ["empleado"], permisos: [] }), res);
      const { datos } = res.json.mock.calls[0][0];
      expect(datos.alcance).toBe("resumen");
      expect(datos.comentarios).toEqual([]);
      expect(TicketEncuesta.comentariosRecientes).not.toHaveBeenCalled();
    });

    it("rechaza fechas con formato inválido", async () => {
      const res = crearRes();
      await Controlador.obtenerEstadisticas(
        estad({ roles: ["super_admin"] }, { desde: "ayer" }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  it("pendientes devuelve los tickets sin calificar del usuario", async () => {
    TicketEncuesta.pendientesDelSolicitante.mockResolvedValue([{ id: 7 }]);
    const res = crearRes();
    await Controlador.pendientes({ user: { usuario_id: 1 } }, res);
    expect(TicketEncuesta.pendientesDelSolicitante).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: [{ id: 7 }] });
  });
});
