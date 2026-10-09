const Ticket = require("../models/ticket.model");
const Usuario = require("../../../portal/backend/models/usuario.model");
const ServicioNotificacion = require("../services/notificacion.service");
const { grupo } = require("../config/database");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const { esAdminTickets, puedeAccederTicket } = require("../utils/acceso-ticket");

const nivelesValidos = ["bajo", "medio", "alto", "critico"];
const estadosValidos = [
  "abierto",
  "asignado",
  "en_progreso",
  "resuelto",
  "cerrado",
];

const ControladorTicket = {
  async crear(req, res) {
    try {
      const { titulo, descripcion, nivel_atencion, categoria } = req.body;

      if (!titulo) {
        return res.status(400).json({
          exito: false,
          mensaje: "El título del ticket es obligatorio",
        });
      }

      if (!nivel_atencion || !nivelesValidos.includes(nivel_atencion)) {
        return res.status(400).json({
          exito: false,
          mensaje: `Nivel de atención inválido. Valores permitidos: ${nivelesValidos.join(", ")}`,
        });
      }

      const ticket = await Ticket.crear({
        usuario_id: req.user.usuario_id,
        titulo,
        descripcion,
        nivel_atencion,
        categoria,
      });

      const usuario = await Usuario.buscarPorId(req.user.usuario_id);

      try {
        await ServicioNotificacion.notificarNuevoTicket(ticket, usuario.correo);
      } catch (error) {
        console.error(
          "Error al enviar notificación de nuevo ticket:",
          error.message,
        );
      }

      try {
        await registrarAccion(
          req,
          "tickets",
          "tickets",
          ticket.id.toString(),
          "INSERT",
          null,
          ticket,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: ticket,
        mensaje: "Ticket creado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear ticket",
        error: error.message,
      });
    }
  },

  async listar(req, res) {
    try {
      const {
        pagina = 1,
        limite = 20,
        estado,
        nivel_atencion,
        categoria,
      } = req.query;

      const filtros = {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        estado,
        nivel_atencion,
        categoria,
      };

      if (!esAdminTickets(req.user)) {
        filtros.usuario_id = req.user.usuario_id;
      }

      const tickets = await Ticket.listar(filtros);
      const total = await Ticket.contar(filtros);

      res.json({
        exito: true,
        datos: {
          tickets,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar tickets",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const ticket = await Ticket.obtenerPorId(req.params.id);

      // Solicitante, tecnico asignado o admin; inexistente para no-admin: 403 uniforme
      if (!esAdminTickets(req.user) && !puedeAccederTicket(req.user, ticket)) {
        console.warn(
          `[Acceso] denegado usuario_id=${req.user.usuario_id} recurso=tickets:${req.params.id}`,
        );
        return res
          .status(403)
          .json({ exito: false, mensaje: "No tienes acceso a este recurso" });
      }

      if (!ticket) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      res.json({ exito: true, datos: ticket });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener ticket",
        error: error.message,
      });
    }
  },

  async actualizarEstado(req, res) {
    try {
      const { estado, tecnico_id } = req.body;

      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          exito: false,
          mensaje: `Estado inválido. Valores permitidos: ${estadosValidos.join(", ")}`,
        });
      }

      const ticketAnterior = await Ticket.obtenerPorId(req.params.id);

      if (!ticketAnterior) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      // Solo el admin puede reasignar tecnico via este endpoint
      const ticket = await Ticket.actualizarEstado(
        req.params.id,
        estado,
        esAdminTickets(req.user) ? tecnico_id || null : null,
      );

      const usuario = await Usuario.buscarPorId(ticketAnterior.usuario_id);

      try {
        await ServicioNotificacion.notificarCambioEstado(
          ticket,
          usuario.correo,
          ticketAnterior.estado,
          estado,
        );
      } catch (error) {
        console.error(
          "Error al enviar notificación de cambio de estado:",
          error.message,
        );
      }

      try {
        await registrarAccion(
          req,
          "tickets",
          "tickets",
          ticket.id.toString(),
          "UPDATE",
          { estado: ticketAnterior.estado },
          {
            estado: ticket.estado,
            tecnico_asignado_id: ticket.tecnico_asignado_id,
          },
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({
        exito: true,
        datos: ticket,
        mensaje: "Estado del ticket actualizado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al actualizar estado del ticket",
        error: error.message,
      });
    }
  },

  async asignarTecnico(req, res) {
    try {
      const { tecnico_id } = req.body;

      if (!tecnico_id) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "ID del técnico es obligatorio" });
      }

      const ticket = await Ticket.asignarTecnico(req.params.id, tecnico_id);

      if (!ticket) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      const tecnico = await Usuario.buscarPorId(tecnico_id);

      try {
        await ServicioNotificacion.notificarAsignacionTecnico(
          ticket,
          tecnico.correo,
        );
      } catch (error) {
        console.error(
          "Error al enviar notificación de asignación:",
          error.message,
        );
      }

      try {
        await registrarAccion(
          req,
          "tickets",
          "tickets",
          ticket.id.toString(),
          "UPDATE",
          { tecnico_asignado_id: null },
          { tecnico_asignado_id: tecnico_id },
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({
        exito: true,
        datos: ticket,
        mensaje: "Técnico asignado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al asignar técnico",
        error: error.message,
      });
    }
  },

  async eliminar(req, res) {
    try {
      const ticket = await Ticket.eliminar(req.params.id);

      if (!ticket) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ticket no encontrado" });
      }

      try {
        await registrarAccion(
          req,
          "tickets",
          "tickets",
          ticket.id.toString(),
          "DELETE",
          ticket,
          null,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({ exito: true, mensaje: "Ticket eliminado exitosamente" });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al eliminar ticket",
        error: error.message,
      });
    }
  },

  async listarTecnicos(req, res) {
    try {
      const consulta = `
        SELECT DISTINCT u.id, u.correo, u.nombre, u.apellido
        FROM usuarios u
        INNER JOIN usuario_rol ur ON u.id = ur.usuario_id
        INNER JOIN roles r ON ur.rol_id = r.id
        LEFT JOIN rol_permiso rp ON r.id = rp.rol_id
        LEFT JOIN permisos p ON rp.permiso_id = p.id
        WHERE r.nombre IN ('super_admin', 'tickets_admin')
          OR p.nombre IN ('tickets.admin', 'tickets.technician')
        ORDER BY u.nombre, u.apellido
      `;
      const resultado = await grupo.query(consulta);
      res.json({ exito: true, datos: resultado.rows });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar técnicos",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorTicket;
