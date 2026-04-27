const EmpleadoHijo = require("../models/empleadoHijo.model");

const EmpleadoHijoController = {
  async listar(req, res) {
    try {
      const hijos = await EmpleadoHijo.listarPorEmpleado(req.params.empleadoId);
      res.json({ exito: true, datos: hijos });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: error.message });
    }
  },

  async crear(req, res) {
    try {
      const hijo = await EmpleadoHijo.crear(req.params.empleadoId, req.body);
      res.status(201).json({ exito: true, datos: hijo });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const hijo = await EmpleadoHijo.actualizar(req.params.id, req.body);
      if (!hijo) return res.status(404).json({ exito: false, mensaje: "Hijo no encontrado" });
      res.json({ exito: true, datos: hijo });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const resultado = await EmpleadoHijo.eliminar(req.params.id);
      if (!resultado) return res.status(404).json({ exito: false, mensaje: "Hijo no encontrado" });
      res.json({ exito: true, datos: { id: resultado.id } });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: error.message });
    }
  },
};

module.exports = EmpleadoHijoController;
