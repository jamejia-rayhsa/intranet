const Modulo = require('../models/modulo.model');
const { auditoriaMiddleware: aud } = require('../../../auditoria/backend/middleware/auditoria.middleware');

const ControladorModulo = {
  async listar(req, res) {
    try {
      const modulos = await Modulo.obtenerTodos();
      res.json({ exito: true, datos: modulos });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al listar módulos', error: error.message });
    }
  },

  async listarActivos(req, res) {
    try {
      const modulos = await Modulo.obtenerActivos();
      res.json({ exito: true, datos: modulos });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al listar módulos activos', error: error.message });
    }
  },

  async obtener(req, res) {
    try {
      const modulo = await Modulo.obtenerPorId(req.params.id);
      if (!modulo) {
        return res.status(404).json({ exito: false, mensaje: 'Módulo no encontrado' });
      }
      res.json({ exito: true, datos: modulo });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al obtener módulo', error: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { nombre, path_reactivo, descripcion, activo } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del módulo es obligatorio' });
      }

      const modulo = await Modulo.crear({ nombre, path_reactivo, descripcion, activo });
      res.status(201).json({ exito: true, datos: modulo, mensaje: 'Módulo creado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al crear módulo', error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const modulo = await Modulo.actualizar(req.params.id, req.body);
      if (!modulo) {
        return res.status(404).json({ exito: false, mensaje: 'Módulo no encontrado' });
      }
      res.json({ exito: true, datos: modulo, mensaje: 'Módulo actualizado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al actualizar módulo', error: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const modulo = await Modulo.eliminar(req.params.id);
      if (!modulo) {
        return res.status(404).json({ exito: false, mensaje: 'Módulo no encontrado' });
      }
      res.json({ exito: true, mensaje: 'Módulo eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al eliminar módulo', error: error.message });
    }
  },
};

module.exports = ControladorModulo;
