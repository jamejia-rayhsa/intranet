const Ubicacion = require("../models/ubicacion.model");

const ControladorUbicacion = {
  async listar(req, res) {
    try {
      const ubicaciones = await Ubicacion.obtenerTodos();
      res.json({ exito: true, datos: ubicaciones });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al listar ubicaciones",
          error: error.message,
        });
    }
  },

  async crear(req, res) {
    try {
      const ubicacion = await Ubicacion.crear(req.body);
      res
        .status(201)
        .json({
          exito: true,
          datos: ubicacion,
          mensaje: "Ubicación creada exitosamente",
        });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al crear ubicación",
          error: error.message,
        });
    }
  },

  async actualizar(req, res) {
    try {
      const ubicacion = await Ubicacion.actualizar(req.params.id, req.body);
      if (!ubicacion)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ubicación no encontrada" });
      res.json({
        exito: true,
        datos: ubicacion,
        mensaje: "Ubicación actualizada exitosamente",
      });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al actualizar ubicación",
          error: error.message,
        });
    }
  },

  async eliminar(req, res) {
    try {
      const ubicacion = await Ubicacion.eliminar(req.params.id);
      if (!ubicacion)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Ubicación no encontrada" });
      res.json({ exito: true, mensaje: "Ubicación eliminada exitosamente" });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al eliminar ubicación",
          error: error.message,
        });
    }
  },
};

module.exports = ControladorUbicacion;
