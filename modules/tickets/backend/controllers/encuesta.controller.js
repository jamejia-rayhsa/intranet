const TicketEncuesta = require("../models/ticketEncuesta.model");
const Ticket = require("../models/ticket.model");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const { esAdminTickets } = require("../utils/acceso-ticket");

const MAX_COMENTARIOS = 1000;
const ESTADOS_CON_ENCUESTA = ["resuelto", "cerrado"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Ranking por técnico y comentarios de todos: solo administración de tickets
function esAdminEncuestas(user) {
  return Boolean(
    user && (user.roles?.includes("super_admin") || user.roles?.includes("tickets_admin") ||
      user.permisos?.includes("tickets.admin")),
  );
}

const ControladorEncuesta = {
  async crear(req, res) {
    try {
      const { calificacion, comentarios } = req.body;

      if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
        return res.status(400).json({
          exito: false,
          mensaje: "La calificación debe ser un número entero entre 1 y 5",
        });
      }

      if (
        comentarios != null &&
        (typeof comentarios !== "string" || comentarios.length > MAX_COMENTARIOS)
      ) {
        return res.status(400).json({
          exito: false,
          mensaje: `Los comentarios deben ser texto de máximo ${MAX_COMENTARIOS} caracteres`,
        });
      }

      const ticket = await Ticket.obtenerPorId(req.params.ticketId);

      if (!ticket) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      if (!ESTADOS_CON_ENCUESTA.includes(ticket.estado)) {
        return res.status(400).json({
          exito: false,
          mensaje: "La encuesta solo se puede responder cuando el ticket está resuelto o cerrado",
        });
      }

      const encuesta = await TicketEncuesta.crear({
        ticket_id: req.params.ticketId,
        calificacion,
        comentarios: comentarios?.trim(),
      });

      if (!encuesta) {
        return res.status(409).json({
          exito: false,
          mensaje: "Ya existe una encuesta para este ticket",
        });
      }

      try {
        await registrarAccion(
          req,
          "tickets",
          "ticket_encuestas",
          encuesta.id.toString(),
          "INSERT",
          null,
          encuesta,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: encuesta,
        mensaje: "Encuesta enviada exitosamente",
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al enviar encuesta",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const encuesta = await TicketEncuesta.obtenerPorTicket(
        req.params.ticketId,
      );

      if (!encuesta) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Encuesta no encontrada" });
      }

      res.json({ exito: true, datos: encuesta });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener encuesta",
        error: error.message,
      });
    }
  },

  async obtenerEstadisticas(req, res) {
    try {
      const { desde, hasta } = req.query;
      if ([desde, hasta].some((f) => f && !FECHA.test(f))) {
        return res.status(400).json({
          exito: false,
          mensaje: "Las fechas deben tener formato AAAA-MM-DD",
        });
      }

      const admin = esAdminEncuestas(req.user);
      // Un técnico solo ve los resultados de sus propios tickets; los demás, solo el resumen global
      const tecnico = !admin && esAdminTickets(req.user);
      const filtros = { desde, hasta, tecnicoId: tecnico ? req.user.usuario_id : undefined };

      const [resumen, porTecnico, porCategoria, comentarios] = await Promise.all([
        TicketEncuesta.obtenerEstadisticas(filtros),
        admin ? TicketEncuesta.porTecnico(filtros) : [],
        admin || tecnico ? TicketEncuesta.porCategoria(filtros) : [],
        admin || tecnico ? TicketEncuesta.comentariosRecientes(filtros) : [],
      ]);

      res.json({
        exito: true,
        datos: {
          ...resumen,
          por_tecnico: porTecnico,
          por_categoria: porCategoria,
          comentarios,
          alcance: admin ? "global" : tecnico ? "propio" : "resumen",
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener estadísticas",
        error: error.message,
      });
    }
  },

  async pendientes(req, res) {
    try {
      const datos = await TicketEncuesta.pendientesDelSolicitante(req.user.usuario_id);
      res.json({ exito: true, datos });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener encuestas pendientes",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorEncuesta;
