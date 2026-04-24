const Permiso = require('../models/permiso.model');

const ControladorPermiso = {
  async listar(req, res) {
    try {
      const permisos = await Permiso.obtenerTodos();
      res.json({ exito: true, datos: permisos });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al listar permisos', error: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del permiso es obligatorio' });
      }

      const permiso = await Permiso.crear(nombre);
      res.status(201).json({ exito: true, datos: permiso, mensaje: 'Permiso creado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al crear permiso', error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del permiso es obligatorio' });
      }

      const permiso = await Permiso.actualizar(req.params.id, nombre);
      if (!permiso) {
        return res.status(404).json({ exito: false, mensaje: 'Permiso no encontrado' });
      }
      res.json({ exito: true, datos: permiso, mensaje: 'Permiso actualizado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al actualizar permiso', error: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const permiso = await Permiso.eliminar(req.params.id);
      if (!permiso) {
        return res.status(404).json({ exito: false, mensaje: 'Permiso no encontrado' });
      }
      res.json({ exito: true, mensaje: 'Permiso eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al eliminar permiso', error: error.message });
    }
  },
};

module.exports = ControladorPermiso;
