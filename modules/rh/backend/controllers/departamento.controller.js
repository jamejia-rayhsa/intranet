const Departamento = require("../models/departamento.model");

const ControladorDepartamento = {
  async listar(req, res) {
    try {
      const departamentos = await Departamento.obtenerTodos();
      res.json({ exito: true, datos: departamentos });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al listar departamentos",
          error: error.message,
        });
    }
  },

  async crear(req, res) {
    try {
      const depto = await Departamento.crear(req.body);
      res
        .status(201)
        .json({
          exito: true,
          datos: depto,
          mensaje: "Departamento creado exitosamente",
        });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al crear departamento",
          error: error.message,
        });
    }
  },

  async actualizar(req, res) {
    try {
      const depto = await Departamento.actualizar(req.params.id, req.body);
      if (!depto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Departamento no encontrado" });
      res.json({
        exito: true,
        datos: depto,
        mensaje: "Departamento actualizado exitosamente",
      });
    } catch (error) {
      res
        .status(400)
        .json({
          exito: false,
          mensaje: "Error al actualizar departamento",
          error: error.message,
        });
    }
  },

  async eliminar(req, res) {
    try {
      const depto = await Departamento.eliminar(req.params.id);
      if (!depto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Departamento no encontrado" });
      res.json({ exito: true, mensaje: "Departamento eliminado exitosamente" });
    } catch (error) {
      res
        .status(500)
        .json({
          exito: false,
          mensaje: "Error al eliminar departamento",
          error: error.message,
        });
    }
  },
};

module.exports = ControladorDepartamento;
