const Puesto = require("../models/puesto.model");

const ControladorPuesto = {
  async listar(req, res) {
    try {
      const puestos = await Puesto.obtenerTodos();
      res.json({ exito: true, datos: puestos });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al listar puestos",
          error: error.message,
        });
    }
  },

  async crear(req, res) {
    try {
      const puesto = await Puesto.crear(req.body);
      res
        .status(201)
        .json({
          exito: true,
          datos: puesto,
          mensaje: "Puesto creado exitosamente",
        });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al crear puesto",
          error: error.message,
        });
    }
  },

  async actualizar(req, res) {
    try {
      const puesto = await Puesto.actualizar(req.params.id, req.body);
      if (!puesto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Puesto no encontrado" });
      res.json({
        exito: true,
        datos: puesto,
        mensaje: "Puesto actualizado exitosamente",
      });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al actualizar puesto",
          error: error.message,
        });
    }
  },

  async eliminar(req, res) {
    try {
      const puesto = await Puesto.eliminar(req.params.id);
      if (!puesto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Puesto no encontrado" });
      res.json({ exito: true, mensaje: "Puesto eliminado exitosamente" });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al eliminar puesto",
          error: error.message,
        });
    }
  },
};

module.exports = ControladorPuesto;
