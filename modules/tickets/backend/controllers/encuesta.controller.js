const TicketEncuesta = require("../models/ticketEncuesta.model");
const Ticket = require("../models/ticket.model");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorEncuesta = {
  async crear(req, res) {
    try {
      const { calificacion, comentarios } = req.body;

      if (!calificacion || calificacion < 1 || calificacion > 5) {
        return res.status(400).json({
          exito: false,
          mensaje: "La calificación debe ser un número entre 1 y 5",
        });
      }

      const ticket = await Ticket.obtenerPorId(req.params.ticketId);

      if (!ticket) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      const encuestaExistente = await TicketEncuesta.obtenerPorTicket(
        req.params.ticketId,
      );

      if (encuestaExistente) {
        return res.status(400).json({
          exito: false,
          mensaje: "Ya existe una encuesta para este ticket",
        });
      }

      const encuesta = await TicketEncuesta.crear({
        ticket_id: req.params.ticketId,
        calificacion,
        comentarios,
      });

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
      res.status(400).json({
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
      const estadisticas = await TicketEncuesta.obtenerEstadisticas();
      res.json({ exito: true, datos: estadisticas });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener estadísticas",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorEncuesta;
