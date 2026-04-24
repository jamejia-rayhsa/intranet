const TicketCategoria = require("../models/ticketCategoria.model");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorCategoria = {
  async listar(req, res) {
    try {
      const categorias = await TicketCategoria.obtenerTodos();
      res.json({ exito: true, datos: categorias });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al listar categorías",
          error: error.message,
        });
    }
  },

  async crear(req, res) {
    try {
      const cat = await TicketCategoria.crear(req.body);
      try {
        await registrarAccion(
          req,
          "tickets",
          "ticket_categorias",
          cat.id.toString(),
          "INSERT",
          null,
          cat,
        );
      } catch (e) {
        console.error(e.message);
      }
      res
        .status(201)
        .json({
          exito: true,
          datos: cat,
          mensaje: "Categoría creada exitosamente",
        });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al crear categoría",
          error: error.message,
        });
    }
  },

  async actualizar(req, res) {
    try {
      const cat = await TicketCategoria.actualizar(req.params.id, req.body);
      if (!cat)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Categoría no encontrada" });
      res.json({
        exito: true,
        datos: cat,
        mensaje: "Categoría actualizada exitosamente",
      });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al actualizar categoría",
          error: error.message,
        });
    }
  },

  async eliminar(req, res) {
    try {
      const cat = await TicketCategoria.eliminar(req.params.id);
      if (!cat)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Categoría no encontrada" });
      res.json({ exito: true, mensaje: "Categoría eliminada exitosamente" });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al eliminar categoría",
          error: error.message,
        });
    }
  },
};

module.exports = ControladorCategoria;
