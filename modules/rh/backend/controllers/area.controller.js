const Area = require("../models/area.model");

const ControladorArea = {
  async listar(req, res) {
    try {
      res.json({ exito: true, datos: await Area.obtenerTodos() });
    } catch (e) {
      res.status(500).json({ exito: false, mensaje: "Error al listar áreas", error: e.message });
    }
  },

  async crear(req, res) {
    try {
      const area = await Area.crear(req.body);
      res.status(201).json({ exito: true, datos: area, mensaje: "Área creada exitosamente" });
    } catch (e) {
      res.status(400).json({ exito: false, mensaje: "Error al crear área", error: e.message });
    }
  },

  async actualizar(req, res) {
    try {
      const area = await Area.actualizar(req.params.id, req.body);
      if (!area) return res.status(404).json({ exito: false, mensaje: "Área no encontrada" });
      res.json({ exito: true, datos: area, mensaje: "Área actualizada exitosamente" });
    } catch (e) {
      res.status(400).json({ exito: false, mensaje: "Error al actualizar área", error: e.message });
    }
  },

  async eliminar(req, res) {
    try {
      const area = await Area.eliminar(req.params.id);
      if (!area) return res.status(404).json({ exito: false, mensaje: "Área no encontrada" });
      res.json({ exito: true, mensaje: "Área eliminada exitosamente" });
    } catch (e) {
      res.status(500).json({ exito: false, mensaje: "Error al eliminar área", error: e.message });
    }
  },

  async importar(req, res) {
    try {
      const { filas } = req.body;
      if (!Array.isArray(filas) || filas.length === 0)
        return res.status(400).json({ exito: false, mensaje: "No se recibieron filas para importar" });
      const resultado = await Area.importarLote(filas);
      res.json({ exito: true, datos: resultado });
    } catch (e) {
      res.status(500).json({ exito: false, mensaje: "Error al importar áreas", error: e.message });
    }
  },
};

module.exports = ControladorArea;
