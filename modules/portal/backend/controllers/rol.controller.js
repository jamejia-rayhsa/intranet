const Rol = require('../models/rol.model');

const ControladorRol = {
  async listar(req, res) {
    try {
      const roles = await Rol.obtenerTodos();
      res.json({ exito: true, datos: roles });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al listar roles', error: error.message });
    }
  },

  async obtener(req, res) {
    try {
      const rol = await Rol.obtenerPorId(req.params.id);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      const permisos = await Rol.obtenerPermisos(rol.id);
      res.json({ exito: true, datos: { ...rol, permisos } });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al obtener rol', error: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio' });
      }

      const rol = await Rol.crear(nombre);
      res.status(201).json({ exito: true, datos: rol, mensaje: 'Rol creado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al crear rol', error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio' });
      }

      const rol = await Rol.actualizar(req.params.id, nombre);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      res.json({ exito: true, datos: rol, mensaje: 'Rol actualizado exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al actualizar rol', error: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const rol = await Rol.eliminar(req.params.id);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      res.json({ exito: true, mensaje: 'Rol eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al eliminar rol', error: error.message });
    }
  },

  async asignarPermisos(req, res) {
    try {
      const { permisos_ids } = req.body;

      if (!Array.isArray(permisos_ids)) {
        return res.status(400).json({ exito: false, mensaje: 'Se requiere un arreglo de IDs de permisos' });
      }

      const permisos = await Rol.asignarPermisos(req.params.id, permisos_ids);
      res.json({ exito: true, datos: permisos, mensaje: 'Permisos asignados exitosamente' });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: 'Error al asignar permisos', error: error.message });
    }
  },
};

module.exports = ControladorRol;
