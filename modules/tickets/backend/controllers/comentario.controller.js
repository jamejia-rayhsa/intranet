const TicketComentario = require("../models/ticketComentario.model");
const { grupo } = require("../config/database");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorComentario = {
  async listar(req, res) {
    try {
      const comentarios = await TicketComentario.obtenerPorTicket(
        req.params.ticketId,
      );
      res.json({ exito: true, datos: comentarios });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar comentarios",
        error: error.message,
      });
    }
  },

  async crear(req, res) {
    try {
      const ticket = await grupo.query(
        "SELECT estado FROM tickets WHERE id = $1",
        [req.params.ticketId],
      );

      if (!ticket.rows[0]) {
        return res.status(404).json({
          exito: false,
          mensaje: "Ticket no encontrado",
        });
      }

      if (ticket.rows[0].estado === "cerrado") {
        return res.status(400).json({
          exito: false,
          mensaje: "No se pueden agregar comentarios a un ticket cerrado",
        });
      }

      const { comentario } = req.body;
      if (!comentario) {
        return res.status(400).json({
          exito: false,
          mensaje: "El comentario es obligatorio",
        });
      }

      const nuevo = await TicketComentario.crear({
        ticket_id: req.params.ticketId,
        usuario_id: req.user.usuario_id,
        comentario,
      });

      try {
        await registrarAccion(
          req,
          "tickets",
          "ticket_comentarios",
          nuevo.id.toString(),
          "INSERT",
          null,
          nuevo,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: nuevo,
        mensaje: "Comentario agregado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al agregar comentario",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorComentario;
